import { create } from "zustand";
import { agentCancel, agentNewSession, agentPrompt } from "@/lib/commands";
import { onAgentEvent } from "@/lib/agent-events";
import { applyChosenModel } from "@/lib/models";
import { classifyError, type ChatError } from "@/lib/chat-errors";
import { inventoryPassages } from "@/lib/db";
import { explainPrefInstructions } from "@/lib/explain-prefs";
import { logError } from "@/lib/log";
import { buildInventoryPrompt } from "@/lib/prompt";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";

export interface LibraryMessage {
  role: "user" | "assistant";
  text: string;
}

interface LibraryChatStore {
  messages: LibraryMessage[];
  streaming: boolean;
  error: ChatError | null;
  /** Live ACP session. Not saved: a universal chat lives until you start a
   * new one or quit. */
  sessionId: string | null;
  ask: (text: string) => Promise<void>;
  /** Re-sends the last question after an error. */
  retry: () => Promise<void>;
  stop: () => Promise<void>;
  /** Starts over with an empty conversation. */
  reset: () => Promise<void>;
}

// Bumped by `reset` so a turn that was in flight can tell it was abandoned.
let epoch = 0;
let lastQuestion: string | null = null;

/** The universal chat: one conversation about everything in the library.
 * Each message goes out with the list of saved articles and the passages
 * that best match it; the session itself keeps the conversation. */
export const useLibraryChatStore = create<LibraryChatStore>((set, get) => {
  void onAgentEvent((event) => {
    if (event.session_id !== get().sessionId) return;
    switch (event.kind) {
      case "token":
        set((s) => {
          const messages = [...s.messages];
          const last = messages[messages.length - 1];
          if (last?.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              text: last.text + event.text,
            };
          } else {
            messages.push({ role: "assistant", text: event.text });
          }
          return { messages };
        });
        break;
      case "done":
        set({ streaming: false });
        break;
      case "permission_request":
        set({
          error: {
            kind: "other",
            message: `The agent asked to ${event.description}, which isn't allowed in a read-only session.`,
          },
        });
        break;
    }
  });

  async function run(question: string) {
    const mine = epoch;
    lastQuestion = question;
    set({ streaming: true, error: null });
    try {
      let sessionId = get().sessionId;
      if (!sessionId) {
        sessionId = await agentNewSession();
        await applyChosenModel(sessionId);
      }
      if (mine !== epoch) return;
      set({ sessionId });
      const passages = await inventoryPassages(question).catch((err) => {
        // Worst case the message goes out with the titles alone.
        logError("library passages lookup failed", err);
        return [];
      });
      if (mine !== epoch) return;
      const inventory = useLibraryStore
        .getState()
        .articles.map((a) => ({ title: a.title, site: a.site }));
      await agentPrompt(
        sessionId,
        buildInventoryPrompt(
          question,
          passages,
          inventory,
          explainPrefInstructions(useUiStore.getState().explainPrefs),
        ),
      );
    } catch (err) {
      if (mine !== epoch) return;
      logError("library chat turn failed", err);
      const error = classifyError(
        err instanceof Error ? err.message : String(err),
      );
      // Drop a half streamed answer so Retry doesn't stack on top of it.
      set((s) => ({
        streaming: false,
        error,
        // Retry starts a new session, in case this one went away with a
        // crashed agent.
        sessionId: null,
        messages:
          s.messages[s.messages.length - 1]?.role === "assistant"
            ? s.messages.slice(0, -1)
            : s.messages,
      }));
      if (error.kind === "logged_out" || error.kind === "adapter_missing") {
        void useAgentStore.getState().refreshStatus();
      }
    }
  }

  return {
    messages: [],
    streaming: false,
    error: null,
    sessionId: null,

    async ask(text) {
      const question = text.trim();
      if (!question || get().streaming) return;
      set((s) => ({
        messages: [...s.messages, { role: "user", text: question }],
      }));
      await run(question);
    },

    async retry() {
      if (!lastQuestion || get().streaming) return;
      await run(lastQuestion);
    },

    async stop() {
      const { sessionId, streaming } = get();
      if (!sessionId || !streaming) return;
      // `streaming` clears when the resulting Done event arrives.
      await agentCancel(sessionId).catch((err) =>
        logError("cancel failed", err),
      );
    },

    async reset() {
      epoch += 1;
      lastQuestion = null;
      const { sessionId, streaming } = get();
      set({
        messages: [],
        streaming: false,
        error: null,
        sessionId: null,
      });
      if (sessionId && streaming) {
        await agentCancel(sessionId).catch((err) =>
          logError("cancel failed", err),
        );
      }
    },
  };
});

import { createStore } from "zustand";
import { agentCancel, agentNewSession, agentPrompt } from "@/lib/commands";
import { onAgentEvent } from "@/lib/agent-events";
import {
  applyProgress,
  emptyProgress,
  type Progress,
} from "@/lib/agent-progress";
import { applyChosenModel } from "@/lib/models";
import { classifyError, type ChatError } from "@/lib/chat-errors";
import {
  addLibraryMessage,
  createLibraryChat,
  deleteLibraryChat,
  inventoryPassages,
  listLibraryChats,
  listLibraryMessages,
  type LibraryChatSummary,
} from "@/lib/db";
import { explainPrefInstructions } from "@/lib/explain-prefs";
import { logError } from "@/lib/log";
import { buildInventoryPrompt } from "@/lib/prompt";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { registerPart, tabStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui-store";

export interface LibraryMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LibraryChatStore {
  /** The saved chat on screen; null for a new one that has no message yet. */
  chatId: string | null;
  /** The chat started in this visit and still on screen. It stays out of the
   * "Previous chats" list until you move on to another chat. */
  liveChatId: string | null;
  /** Every saved chat, newest first, for the sidebar. */
  chats: LibraryChatSummary[];
  loadChats: () => Promise<void>;
  /** Opens a saved chat. */
  openChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  messages: LibraryMessage[];
  streaming: boolean;
  /** What the agent is doing this turn besides writing the answer. */
  progress: Progress;
  error: ChatError | null;
  /** Live ACP session. Not saved: a reopened chat starts a new session and
   * is given what was said so far. */
  sessionId: string | null;
  ask: (text: string) => Promise<void>;
  /** Re-sends the last question after an error. */
  retry: () => Promise<void>;
  stop: () => Promise<void>;
  /** Starts over with an empty conversation. */
  reset: () => Promise<void>;
}

/** The universal chat: one conversation about everything in the library.
 * Each message goes out with the list of saved articles and the passages
 * that best match it; the session itself keeps the conversation. */
registerPart("libraryChat", (bundle) => {
  // Bumped by `reset` so a turn that was in flight can tell it was abandoned.
  let epoch = 0;
  let lastQuestion: string | null = null;

  const store = createStore<LibraryChatStore>((set, get) => {
    const unlisten = onAgentEvent((event) => {
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
        case "done": {
          set({ streaming: false, progress: emptyProgress });
          const { chatId, messages } = get();
          const last = messages[messages.length - 1];
          if (chatId && last?.role === "assistant" && last.text) {
            void addLibraryMessage(chatId, "assistant", last.text)
              .then(() => get().loadChats())
              .catch((err) => logError("saving the reply failed", err));
          }
          break;
        }
        case "thought":
        case "step":
        case "plan":
        case "usage":
          set((s) => ({ progress: applyProgress(s.progress, event) }));
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
    bundle.cleanups.push(() => void unlisten.then((off) => off()));

    async function run(question: string) {
      const mine = epoch;
      lastQuestion = question;
      set({ streaming: true, error: null, progress: emptyProgress });
      try {
        let sessionId = get().sessionId;
        // A session that has not been in this conversation is told what was
        // said so far (a reopened chat, or one that had to be restarted).
        const history = sessionId ? [] : get().messages.slice(0, -1);
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
            history,
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
          progress: emptyProgress,
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
      chatId: null,
      liveChatId: null,
      chats: [],
      messages: [],
      streaming: false,
      progress: emptyProgress,
      error: null,
      sessionId: null,

      async ask(text) {
        const question = text.trim();
        if (!question || get().streaming) return;
        set((s) => ({
          messages: [...s.messages, { role: "user", text: question }],
        }));
        // The first message makes the chat, named after what was asked. A
        // failure to save must not stop the question from being answered.
        try {
          let chatId = get().chatId;
          if (!chatId) {
            chatId = await createLibraryChat(question.slice(0, 60));
            set({ chatId, liveChatId: chatId });
          }
          await addLibraryMessage(chatId, "user", question);
          void get().loadChats();
        } catch (err) {
          logError("saving the chat failed", err);
        }
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

      async loadChats() {
        try {
          set({ chats: await listLibraryChats() });
        } catch (err) {
          logError("listing chats failed", err);
        }
      },

      async openChat(id) {
        if (get().chatId === id) return;
        epoch += 1;
        lastQuestion = null;
        const { sessionId, streaming } = get();
        if (sessionId && streaming) {
          await agentCancel(sessionId).catch((err) =>
            logError("cancel failed", err),
          );
        }
        try {
          const messages = await listLibraryMessages(id);
          set({
            chatId: id,
            liveChatId: null,
            messages,
            streaming: false,
            progress: emptyProgress,
            error: null,
            sessionId: null,
          });
        } catch (err) {
          logError("opening the chat failed", err);
        }
      },

      async deleteChat(id) {
        try {
          await deleteLibraryChat(id);
        } catch (err) {
          logError("deleting the chat failed", err);
        }
        if (get().chatId === id) await get().reset();
        await get().loadChats();
      },

      async reset() {
        epoch += 1;
        lastQuestion = null;
        const { sessionId, streaming } = get();
        set({
          chatId: null,
          liveChatId: null,
          messages: [],
          streaming: false,
          progress: emptyProgress,
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
  return store;
});

export const useLibraryChatStore = tabStore("libraryChat");

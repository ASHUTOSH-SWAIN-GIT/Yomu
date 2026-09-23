import { create } from "zustand";
import {
  agentLogin,
  agentNewSession,
  agentPrompt,
  agentStatus,
} from "@/lib/commands";
import { onAgentEvent } from "@/lib/agent-events";
import type { AgentStatus } from "@/types/agent";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AgentStore {
  status: AgentStatus | "checking";
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  login: () => Promise<void>;
  send: (text: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => {
  // Subscribed once per app session; every AgentEvent carries a
  // session_id, so this filters to whichever session is currently open
  // in the debug panel (see ROADMAP.md M4 exit criteria: "hello" prompt
  // streams back in a debug panel — this *is* that panel for now,
  // ahead of the real Explain UI in M5).
  void onAgentEvent((event) => {
    const { sessionId } = get();
    if (!sessionId || event.session_id !== sessionId) return;

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
      case "error":
        set({ streaming: false, error: event.message });
        break;
      case "permission_request":
        // Explain sessions are read only; the Rust side never grants
        // these (see agent/harness.rs). Surfaced so it's not a silent
        // no-op from the user's point of view.
        set({
          error: `Agent asked to ${event.description}, which isn't allowed in a read-only session.`,
        });
        break;
    }
  });

  return {
    status: "checking",
    sessionId: null,
    messages: [],
    streaming: false,
    error: null,

    async refreshStatus() {
      const status = await agentStatus();
      set({ status });
    },

    async login() {
      await agentLogin();
      // codex login opens a browser; give it a moment before re-checking
      // rather than polling tightly.
      setTimeout(() => void get().refreshStatus(), 1500);
    },

    async send(text) {
      set((s) => ({
        messages: [...s.messages, { role: "user", text }],
        streaming: true,
        error: null,
      }));
      try {
        let sessionId = get().sessionId;
        if (!sessionId) {
          sessionId = await agentNewSession();
          set({ sessionId });
        }
        await agentPrompt(sessionId, text);
      } catch (err) {
        set({
          streaming: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
});

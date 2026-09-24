import { create } from "zustand";
import {
  agentNewSession,
  agentPrompt,
  agentResumeSession,
} from "@/lib/commands";
import { onAgentEvent } from "@/lib/agent-events";
import { classifyError, type ChatError } from "@/lib/chat-errors";
import {
  addHighlight,
  addMessage,
  createChat,
  getChatForArticle,
  listMessages,
  setChatSession,
} from "@/lib/db";
import { buildPrompt } from "@/lib/prompt";
import { useAgentStore } from "@/stores/agent-store";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";
import type { Chat, Highlight, StoredArticle } from "@/types/library";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Set on the message that started an explain. */
  quote?: string;
}

export type Selection = Omit<Highlight, "id" | "articleId">;

interface ChatStore {
  articleId: string | null;
  chat: Chat | null;
  /** Live ACP session id. Null until first use after a restart. */
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: ChatError | null;
  loadForArticle: (articleId: string | null) => Promise<void>;
  explain: (article: StoredArticle, selection: Selection) => Promise<void>;
  send: (article: StoredArticle, text: string) => Promise<void>;
  retry: () => Promise<void>;
}

// What to re-run on Retry, plus the highlight follow ups refer to.
type PromptBuilder = (freshSession: boolean) => string;
let lastBuild: PromptBuilder | null = null;
let lastHighlight: Highlight | null = null;

export const useChatStore = create<ChatStore>((set, get) => {
  // Every session's events share one channel; only the open chat's
  // session is rendered.
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
      case "done": {
        const { chat, messages } = get();
        const last = messages[messages.length - 1];
        set({ streaming: false });
        if (chat && last?.role === "assistant" && last.text) {
          void addMessage(chat.id, "assistant", last.text);
        }
        break;
      }
      case "permission_request":
        // Denied on the Rust side (agent/rpc.rs); tell the user why
        // the agent may not have done what it wanted.
        set({
          error: {
            kind: "other",
            message: `The agent asked to ${event.description}, which isn't allowed in a read-only session.`,
          },
        });
        break;
    }
  });

  /** Returns a usable session, resuming the saved one if possible.
   * `fresh` is true when context was lost and the prompt must carry it. */
  async function ensureSession(
    chat: Chat,
  ): Promise<{ sessionId: string; fresh: boolean }> {
    const current = get().sessionId;
    if (current) return { sessionId: current, fresh: false };

    if (chat.acpSessionId) {
      try {
        await agentResumeSession(chat.acpSessionId);
        set({ sessionId: chat.acpSessionId });
        return { sessionId: chat.acpSessionId, fresh: false };
      } catch {
        // Agent no longer has it (history cleared, adapter updated):
        // fall through to a new session.
      }
    }
    const sessionId = await agentNewSession();
    await setChatSession(chat.id, sessionId);
    set({ sessionId, chat: { ...chat, acpSessionId: sessionId } });
    return { sessionId, fresh: true };
  }

  async function runTurn(chat: Chat, build: PromptBuilder) {
    lastBuild = build;
    set({ streaming: true, error: null });
    try {
      const { sessionId, fresh } = await ensureSession(chat);
      await agentPrompt(sessionId, build(fresh));
    } catch (err) {
      const error = classifyError(
        err instanceof Error ? err.message : String(err),
      );
      // Drop a half streamed answer so Retry doesn't stack on top of it.
      set((s) => ({
        streaming: false,
        error,
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

  async function chatFor(article: StoredArticle): Promise<Chat> {
    return get().chat ?? (await createChat(article.id));
  }

  return {
    articleId: null,
    chat: null,
    sessionId: null,
    messages: [],
    streaming: false,
    error: null,

    async loadForArticle(articleId) {
      set({
        articleId,
        chat: null,
        sessionId: null,
        messages: [],
        streaming: false,
        error: null,
      });
      lastBuild = null;
      lastHighlight = null;
      if (!articleId) return;

      const chat = await getChatForArticle(articleId);
      if (get().articleId !== articleId || !chat) return;
      const stored = await listMessages(chat.id);
      if (get().articleId !== articleId) return;

      const withHighlight = [...stored].reverse().find((m) => m.highlight);
      lastHighlight = withHighlight?.highlight ?? null;
      set({
        chat,
        messages: stored.map((m) => ({
          role: m.role,
          text: m.content,
          quote: m.highlight?.text,
        })),
      });
    },

    async explain(article, selection) {
      if (get().streaming) return;
      useUiStore.getState().setChatPanelOpen(true);

      const chat = await chatFor(article);
      const highlight = await addHighlight({
        ...selection,
        articleId: article.id,
      });
      lastHighlight = highlight;
      await addMessage(chat.id, "user", highlight.text, highlight.id);
      set((s) => ({
        chat,
        messages: [
          ...s.messages,
          { role: "user", text: "Explain this", quote: highlight.text },
        ],
      }));
      await runTurn(chat, () => buildPrompt(article, highlight));
    },

    async send(article, text) {
      if (get().streaming) return;
      const chat = await chatFor(article);
      await addMessage(chat.id, "user", text);
      set((s) => ({ chat, messages: [...s.messages, { role: "user", text }] }));

      // A follow up normally rides on the live session's context. If the
      // session was lost (fresh), re-send the passage context with it.
      const highlight = lastHighlight;
      await runTurn(chat, (fresh) =>
        fresh && highlight ? buildPrompt(article, highlight, text) : text,
      );
    },

    async retry() {
      const { chat } = get();
      if (!chat || !lastBuild || get().streaming) return;
      await runTurn(chat, lastBuild);
    },
  };
});

// Keep the chat in step with whichever article is open in the reader.
useReaderStore.subscribe((state, prev) => {
  const id = state.state.status === "ready" ? state.state.article.id : null;
  const prevId = prev.state.status === "ready" ? prev.state.article.id : null;
  if (id !== prevId) void useChatStore.getState().loadForArticle(id);
});

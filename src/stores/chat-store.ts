import { create } from "zustand";
import {
  agentCancel,
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
  deleteLastAssistantMessage,
  getChatForArticle,
  listHighlights,
  listMessages,
  relatedArticles as findRelatedArticles,
  setChatSession,
} from "@/lib/db";
import { priorExplanations as findPriorExplanations } from "@/lib/exchanges";
import { explainPrefInstructions } from "@/lib/explain-prefs";
import { logError } from "@/lib/log";
import { imageQuote, parseImageQuote } from "@/lib/images";
import {
  buildPrompt,
  buildSummaryPrompt,
  type PromptOptions,
} from "@/lib/prompt";
import { useAgentStore } from "@/stores/agent-store";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";
import type { Chat, Highlight, StoredArticle } from "@/types/library";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Set on the message that started an explain. */
  quote?: string;
  highlightId?: string;
  /** True for the "Summarize this article" request. */
  summary?: boolean;
}

const SUMMARY_LABEL = "Summarize this article";
const EXPLAIN_LABEL = "Explain this";

export type Selection = Omit<Highlight, "id" | "articleId">;

interface ChatStore {
  articleId: string | null;
  chat: Chat | null;
  /** Live ACP session id. Null until first use after a restart. */
  sessionId: string | null;
  messages: ChatMessage[];
  /** Every passage explained in this article, painted in the reader. */
  highlights: Highlight[];
  streaming: boolean;
  error: ChatError | null;
  loadForArticle: (articleId: string | null) => Promise<void>;
  explain: (article: StoredArticle, selection: Selection) => Promise<void>;
  /** Asks the user's own question about a passage (an explanation if empty). */
  askAbout: (
    article: StoredArticle,
    selection: Selection,
    question: string,
  ) => Promise<void>;
  send: (article: StoredArticle, text: string) => Promise<void>;
  retry: () => Promise<void>;
  /** Asks for a fresh answer to the last question, replacing the last reply. */
  regenerate: (article: StoredArticle) => Promise<void>;
  /** Asks the agent about one image in the article (sent as an attachment). */
  explainImage: (
    article: StoredArticle,
    image: { blockIndex: number; src: string; alt: string | null },
  ) => Promise<void>;
  /** Summarizes the whole article, no selection needed. */
  summarize: (article: StoredArticle) => Promise<void>;
  /** Stops the reply in flight; the partial text is kept and saved. */
  stop: () => Promise<void>;
}

// What to re-run on Retry, plus the highlight follow ups refer to.
/** What to send: the prompt text and, for image questions, the image URL. */
interface PromptSpec {
  text: string;
  imageUrl?: string;
}
type PromptBuilder = (
  freshSession: boolean,
  fullContextAlreadySent: boolean,
) => PromptSpec;

/** Prompt about a highlight; an image highlight also attaches the image. */
function specFor(
  article: StoredArticle,
  highlight: Highlight,
  options: PromptOptions = {},
): PromptSpec {
  return {
    // Skill level / code-example preference (A4) applies to every explain
    // prompt, so it lives here rather than at each call site.
    text: buildPrompt(article, highlight, {
      ...options,
      personalizationNotes: explainPrefInstructions(
        useUiStore.getState().explainPrefs,
      ),
    }),
    imageUrl: parseImageQuote(highlight.text)?.src,
  };
}
let lastBuild: PromptBuilder | null = null;
let lastHighlight: Highlight | null = null;
// Sessions (by live ACP session id) that have already received the full
// article body once this app run — lets buildPrompt skip resending it on a
// later Explain/question in the same session, since the model already has
// it. Never consulted for a long article, which always sends only the
// passage's nearby blocks (see lib/prompt.ts).
const fullContextSentFor = new Set<string>();

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
      const alreadySent = fullContextSentFor.has(sessionId);
      const { text, imageUrl } = build(fresh, alreadySent);
      // Whatever kind of turn this is, the model now has the article body
      // in its own session context (a plain Explain sends it via
      // buildPrompt; summarize sends even more of it directly).
      fullContextSentFor.add(sessionId);
      if (imageUrl) await agentPrompt(sessionId, text, imageUrl);
      else await agentPrompt(sessionId, text);
    } catch (err) {
      logError("explain turn failed", err);
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

  /** Snippets from other saved articles touching on the same thing (A3).
   * Never lets a search hiccup break the explain flow — worst case, the
   * prompt just goes out without this extra context. Skipped for an image
   * question: alt text isn't meaningful search input. */
  async function relatedArticlesFor(articleId: string, text: string) {
    if (parseImageQuote(text)) return [];
    try {
      return await findRelatedArticles(articleId, text);
    } catch (err) {
      logError("related articles lookup failed", err);
      return [];
    }
  }

  /** Saves a highlight and asks about it: an explanation when `question` is
   * absent, otherwise the user's own question about that passage. */
  async function startOnHighlight(
    article: StoredArticle,
    selection: Selection,
    question?: string,
  ) {
    if (get().streaming) return;
    useUiStore.getState().setAnswerOpen(true);
    useUiStore.getState().setAnswerFocus(null);

    const chat = await chatFor(article);
    const highlight = await addHighlight({
      ...selection,
      articleId: article.id,
    });
    lastHighlight = highlight;
    // The message content is the question, or the passage itself for a plain
    // explanation (restore shows that case as "Explain this").
    await addMessage(chat.id, "user", question ?? highlight.text, highlight.id);
    set((s) => ({
      chat,
      highlights: [...s.highlights, highlight],
      messages: [
        ...s.messages,
        {
          role: "user",
          text: question ?? EXPLAIN_LABEL,
          quote: highlight.text,
          highlightId: highlight.id,
        },
      ],
    }));
    const related = await relatedArticlesFor(
      article.id,
      question ?? highlight.text,
    );
    await runTurn(chat, (fresh, alreadySent) =>
      specFor(article, highlight, {
        question,
        kind: "question",
        fullContextAlreadySent: alreadySent,
        relatedArticles: related,
        // A continuing session already has every earlier exchange verbatim;
        // this is only for a session that had to be recreated.
        priorExplanations: fresh
          ? findPriorExplanations(get().messages, highlight.id)
          : undefined,
      }),
    );
  }

  return {
    articleId: null,
    chat: null,
    sessionId: null,
    messages: [],
    highlights: [],
    streaming: false,
    error: null,

    async loadForArticle(articleId) {
      set({
        articleId,
        chat: null,
        sessionId: null,
        messages: [],
        highlights: [],
        streaming: false,
        error: null,
      });
      lastBuild = null;
      lastHighlight = null;
      // A resumed session after switching articles gets the full context
      // resent once, even if it technically had it before switching away —
      // simpler and safer than tracking that across navigation.
      fullContextSentFor.clear();
      if (!articleId) return;

      const highlights = await listHighlights(articleId);
      if (get().articleId !== articleId) return;
      set({ highlights });

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
          // A plain explanation stores the passage itself as its content.
          text:
            m.highlight && m.content === m.highlight.text
              ? EXPLAIN_LABEL
              : m.content,
          quote: m.highlight?.text,
          highlightId: m.highlight?.id,
          summary: m.role === "user" && m.content === SUMMARY_LABEL,
        })),
      });
    },

    async explain(article, selection) {
      await startOnHighlight(article, selection);
    },

    async askAbout(article, selection, question) {
      const text = question.trim();
      if (!text) return startOnHighlight(article, selection);
      await startOnHighlight(article, selection, text);
    },

    async send(article, text) {
      if (get().streaming) return;
      const chat = await chatFor(article);
      await addMessage(chat.id, "user", text);
      set((s) => ({ chat, messages: [...s.messages, { role: "user", text }] }));

      // A follow up normally rides on the live session's context. If the
      // session was lost (fresh), re-send the passage context with it.
      const highlight = lastHighlight;
      await runTurn(chat, (fresh, alreadySent) =>
        fresh && highlight
          ? specFor(article, highlight, {
              question: text,
              fullContextAlreadySent: alreadySent,
              priorExplanations: findPriorExplanations(
                get().messages,
                highlight.id,
              ),
            })
          : { text },
      );
    },

    async regenerate(article) {
      const { chat, messages, highlights, streaming } = get();
      if (!chat || streaming) return;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser || messages[messages.length - 1]?.role !== "assistant") {
        return;
      }
      const highlight = highlights.find((h) => h.id === lastUser.highlightId);
      const asked = lastUser.text !== EXPLAIN_LABEL;
      const related = highlight
        ? await relatedArticlesFor(
            article.id,
            asked ? lastUser.text : highlight.text,
          )
        : [];

      await deleteLastAssistantMessage(chat.id);
      set({ messages: messages.slice(0, -1) });
      await runTurn(chat, (fresh, alreadySent) => {
        if (highlight) {
          return specFor(article, highlight, {
            question: asked ? lastUser.text : undefined,
            kind: "question",
            fullContextAlreadySent: alreadySent,
            relatedArticles: related,
            priorExplanations: fresh
              ? findPriorExplanations(get().messages, highlight.id)
              : undefined,
          });
        }
        if (lastUser.summary) return { text: buildSummaryPrompt(article) };
        return fresh && lastHighlight
          ? specFor(article, lastHighlight, {
              question: lastUser.text,
              fullContextAlreadySent: alreadySent,
              priorExplanations: findPriorExplanations(
                get().messages,
                lastHighlight.id,
              ),
            })
          : { text: lastUser.text };
      });
    },

    async explainImage(article, image) {
      // An image is stored as a highlight whose text is Markdown for it, so
      // it survives restarts and can be regenerated with the same image.
      await get().explain(article, {
        blockIndex: image.blockIndex,
        startOffset: 0,
        endOffset: 0,
        text: imageQuote(image.alt, image.src),
      });
    },

    async summarize(article) {
      if (get().streaming) return;
      const chat = await chatFor(article);
      await addMessage(chat.id, "user", SUMMARY_LABEL);
      set((s) => ({
        chat,
        messages: [
          ...s.messages,
          { role: "user", text: SUMMARY_LABEL, summary: true },
        ],
      }));
      await runTurn(chat, () => ({ text: buildSummaryPrompt(article) }));
    },

    async stop() {
      const { sessionId, streaming } = get();
      if (!sessionId || !streaming) return;
      // `streaming` clears when the resulting Done event arrives.
      await agentCancel(sessionId).catch((err) =>
        logError("cancel failed", err),
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

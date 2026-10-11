import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Pencil, X } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { Thinking } from "@/components/chat/thinking";
import { IconButton } from "@/components/ui/icon-button";
import { CopyButton } from "@/components/chat/copy-button";
import { AgentActivity } from "@/components/chat/agent-activity";
import { AgentPill } from "@/components/chat/agent-pill";
import { SaveAnswerButton } from "@/components/chat/save-answer-button";
import { saveAnswerAsComment } from "@/lib/save-answer";
import { RegenerateButton } from "@/components/chat/regenerate-button";
import { ContextNote } from "@/components/chat/context-note";
import { ErrorNote } from "@/components/chat/error-note";
import { SourceChips } from "@/components/chat/source-link";
import { ARTICLE_COMMANDS, PAPER_COMMANDS } from "@/lib/slash-commands";
import { isPdfUrl } from "@/lib/pdf/identity";
import { hasProgress } from "@/lib/agent-progress";
import { Markdown } from "@/components/chat/markdown";
import { chatArtFor } from "@/lib/chat-art";
import { openChatFullInNewTab } from "@/lib/navigate";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";
import { toast } from "@/stores/toast-store";

/** The chat beside the article: ask anything about what you are reading. The
 * agent is given the article's text, and the conversation is kept per
 * article. */
export function ChatPanel() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const progress = useChatStore((s) => s.progress);
  const contextUsage = useChatStore((s) => s.context);
  const error = useChatStore((s) => s.error);
  const ask = useChatStore((s) => s.ask);
  const stop = useChatStore((s) => s.stop);
  const retry = useChatStore((s) => s.retry);
  const regenerate = useChatStore((s) => s.regenerate);
  const chatOpen = useViewStore((s) => s.chatOpen);
  const setChatOpen = useViewStore((s) => s.setChatOpen);
  const full = useViewStore((s) => s.chatFull);
  const setFull = useViewStore((s) => s.setChatFull);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const ready = useAgentStore((s) => s.status) === "ready";

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The last question that can be edited (a free question to the article).
  const lastQuestion = messages.map((m) => m.role).lastIndexOf("user");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const editLast = useChatStore((s) => s.editLast);
  const highlights = useChatStore((s) => s.highlights);
  // The passage a reply is about: the one its question was asked on.
  const passageOf = (i: number) => {
    const question = messages
      .slice(0, i)
      .reverse()
      .find((m) => m.role === "user");
    return highlights.find((h) => h.id === question?.highlightId) ?? null;
  };
  const waiting =
    streaming && messages[messages.length - 1]?.role !== "assistant";

  // Keep the newest words in view while a reply streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

  // Opening the chat puts the cursor in the box once the slide has started.
  useEffect(() => {
    if (!chatOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [chatOpen]);

  // Escape leaves full screen.
  useEffect(() => {
    if (!full || !chatOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, chatOpen, setFull]);

  if (!article) return null;

  function send(question: string) {
    if (!article || !question.trim() || streaming) return;
    if (!ready) return setSetupOpen(true);
    void ask(article, question);
    setText("");
  }

  return (
    <aside
      aria-label="Chat about this article"
      className="bg-background border-border flex h-full w-full min-w-[20rem] flex-col border-l"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-5">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h2 className="text-lead font-semibold">Chat</h2>
          <AgentPill working={streaming} />
          {/* Beside the article its title is in view already. */}
          {full && (
            <span className="text-muted-foreground text-ui min-w-0 truncate">
              {article.title}
            </span>
          )}
        </div>
        <IconButton
          label={full ? "Exit full screen (Esc)" : "Open the chat full screen"}
          onClick={() =>
            full ? setFull(false) : void openChatFullInNewTab(article.id)
          }
        >
          {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </IconButton>
        <IconButton label="Close the chat" onClick={() => setChatOpen(false)}>
          <X aria-hidden />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col py-4">
          {messages.length === 0 ? (
            // Nothing yet: a short invitation.
            <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-12 text-center">
              <img
                src={chatArtFor(article.id)}
                alt=""
                aria-hidden
                draggable={false}
                className="size-20 rounded-full shadow-[var(--shadow-card)]"
              />
              <div>
                <p className="text-title leading-tight font-semibold tracking-[-0.015em]">
                  Ask about this article
                </p>
                <p className="text-muted-foreground text-prose mt-1.5">
                  The agent has the whole text, so ask it anything.
                </p>
              </div>
              {/* A first question to start from. */}
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {ARTICLE_COMMANDS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => send(c.text)}
                    className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 text-ui h-8 rounded-full px-3.5 outline-none focus-visible:ring-2"
                  >
                    {c.hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  // Yours: a bubble on the right, as wide as the message.
                  <li
                    key={i}
                    className="group/question flex flex-col items-end gap-1.5"
                  >
                    {m.quote && (
                      <p className="text-muted-foreground border-border text-meta line-clamp-2 max-w-[85%] border-l-2 pl-2 italic">
                        {m.quote}
                      </p>
                    )}
                    {editing === i ? (
                      <form
                        className="flex w-full max-w-[85%] flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void editLast(article, editText);
                          setEditing(null);
                        }}
                      >
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditing(null);
                          }}
                          rows={2}
                          aria-label="Edit your question"
                          className="bg-muted text-prose field-sizing-content max-h-52 w-full resize-none rounded-2xl px-4 py-2.5 leading-6 outline-none"
                        />
                        <span className="text-meta flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!editText.trim()}
                            className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground rounded-md px-2.5 py-1 font-medium"
                          >
                            Ask again
                          </button>
                        </span>
                      </form>
                    ) : (
                      <>
                        <p className="bg-muted text-prose max-w-[85%] rounded-3xl px-4 py-2.5 leading-6 whitespace-pre-wrap">
                          {m.text}
                        </p>
                        {i === lastQuestion &&
                          m.scope === "article" &&
                          !streaming && (
                            <IconButton
                              label="Edit and ask again"
                              size="md"
                              onClick={() => {
                                setEditText(m.text);
                                setEditing(i);
                              }}
                              className="opacity-0 group-hover/question:opacity-100 focus-visible:opacity-100"
                            >
                              <Pencil aria-hidden />
                            </IconButton>
                          )}
                      </>
                    )}
                  </li>
                ) : (
                  // The agent's: plain text on the page, with a copy button.
                  <li key={i} className="group text-prose leading-7">
                    {m.trace && <AgentActivity progress={m.trace} finished />}
                    <Markdown>{m.text}</Markdown>
                    {!(streaming && i === messages.length - 1) && (
                      <>
                        <SourceChips text={m.text} />
                        <div className="flex items-center gap-0.5">
                          <CopyButton text={m.text} />
                          {passageOf(i) && (
                            <SaveAnswerButton
                              onClick={() => {
                                const passage = passageOf(i);
                                if (passage)
                                  void saveAnswerAsComment(
                                    passage,
                                    m.text,
                                  ).then(() =>
                                    toast(
                                      "Saved as a comment beside the words",
                                    ),
                                  );
                              }}
                            />
                          )}
                          {i === messages.length - 1 && (
                            <RegenerateButton
                              onClick={() => void regenerate(article)}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ),
              )}
              {streaming && hasProgress(progress) && (
                <li>
                  <AgentActivity progress={progress} />
                </li>
              )}
              {waiting && <Thinking />}
            </ul>
          )}
          {error && <ErrorNote error={error} onRetry={retry} />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-1 pb-4">
        <Composer
          id="chat-input"
          textareaRef={inputRef}
          value={text}
          onChange={setText}
          onSend={send}
          onStop={() => void stop()}
          onSetup={() => setSetupOpen(true)}
          streaming={streaming}
          ready={ready}
          commands={
            isPdfUrl(article.canonicalUrl)
              ? [...ARTICLE_COMMANDS, ...PAPER_COMMANDS]
              : ARTICLE_COMMANDS
          }
          placeholder={
            ready
              ? "Ask about this article, or type / for shortcuts"
              : "Set up an agent to chat"
          }
        />
        <ContextNote usage={contextUsage} />
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Maximize2, Minimize2, Square, X } from "lucide-react";
import { CopyButton } from "@/components/chat/copy-button";
import { Markdown } from "@/components/chat/markdown";
import { chatArtFor } from "@/lib/chat-art";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";

/** The chat beside the article: ask anything about what you are reading. The
 * agent is given the article's text, and the conversation is kept per
 * article. */
export function ChatPanel() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const ask = useChatStore((s) => s.ask);
  const stop = useChatStore((s) => s.stop);
  const retry = useChatStore((s) => s.retry);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);
  const full = useUiStore((s) => s.chatFull);
  const setFull = useUiStore((s) => s.setChatFull);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const ready = useAgentStore((s) => s.status) === "ready";

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  const iconButton =
    "text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 grid size-8 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2";

  return (
    <aside
      aria-label="Chat about this article"
      className="bg-background border-border flex h-full w-full min-w-[26rem] flex-col border-l"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <h2 className="text-[0.875rem] font-semibold">Chat</h2>
          <span className="text-muted-foreground truncate text-[0.6875rem]">
            {article.title}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setFull(!full)}
          aria-label={full ? "Exit full screen" : "Full screen"}
          title={full ? "Exit full screen (Esc)" : "Full screen"}
          className={iconButton}
        >
          {full ? (
            <Minimize2 className="size-4" aria-hidden />
          ) : (
            <Maximize2 className="size-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
          className={iconButton}
        >
          <X className="size-4" aria-hidden />
        </button>
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
                className="size-24 rounded-full shadow-[0_12px_40px_-8px_rgb(124_92_255/0.5)]"
              />
              <div>
                <p className="text-[1.375rem] leading-tight font-bold tracking-[-0.02em]">
                  Ask about this article
                </p>
                <p className="text-muted-foreground mt-1.5 text-[0.875rem]">
                  I have read it, so ask me anything.
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  // Yours: a bubble on the right, as wide as the message.
                  <li key={i} className="flex flex-col items-end gap-1.5">
                    {m.quote && (
                      <p className="text-muted-foreground border-border line-clamp-2 max-w-[85%] border-l-2 pl-2 text-[0.75rem] italic">
                        {m.quote}
                      </p>
                    )}
                    <p className="bg-muted max-w-[85%] rounded-3xl px-4 py-2.5 text-[0.875rem] leading-6 whitespace-pre-wrap">
                      {m.text}
                    </p>
                  </li>
                ) : (
                  // The agent's: plain text on the page, with a copy button.
                  <li key={i} className="group text-[0.875rem] leading-7">
                    <Markdown>{m.text}</Markdown>
                    {!(streaming && i === messages.length - 1) && (
                      <CopyButton text={m.text} />
                    )}
                  </li>
                ),
              )}
              {waiting && (
                <li
                  aria-label="Thinking"
                  className="text-muted-foreground flex items-center gap-3 py-1"
                >
                  <img
                    src={chatArtFor(article.id)}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="size-8 shrink-0 animate-[spin_6s_linear_infinite] rounded-full shadow-[var(--shadow-card)]"
                  />
                  <span className="flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <i
                        key={delay}
                        className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                </li>
              )}
            </ul>
          )}
          {error && (
            <div
              role="alert"
              className="text-destructive border-destructive/40 mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-[0.8125rem]"
            >
              {error.message}
              <button
                type="button"
                onClick={() =>
                  error.kind === "logged_out" ||
                  error.kind === "adapter_missing"
                    ? setSetupOpen(true)
                    : void retry()
                }
                className="self-start font-medium underline underline-offset-2"
              >
                {error.kind === "logged_out" || error.kind === "adapter_missing"
                  ? "Open setup"
                  : "Try again"}
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="shrink-0 px-4 pt-1 pb-4">
        <div className="bg-card border-border focus-within:border-input mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border py-1.5 pr-1.5 pl-4 shadow-[var(--shadow-card)] transition-colors">
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            disabled={!ready}
            placeholder={
              ready ? "Ask about this article" : "Set up Explain to chat"
            }
            aria-label="Message"
            className="placeholder:text-muted-foreground field-sizing-content max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-[0.875rem] leading-5 outline-none disabled:opacity-60"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              aria-label="Stop"
              className="bg-primary text-primary-foreground focus-visible:ring-ring/60 mb-0.5 grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            >
              <Square className="size-3 fill-current" aria-hidden />
            </button>
          ) : ready ? (
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send"
              className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground focus-visible:ring-ring/60 mb-0.5 grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="bg-primary text-primary-foreground focus-visible:ring-ring/60 mb-0.5 h-8 shrink-0 rounded-full px-3.5 text-[0.75rem] font-medium outline-none focus-visible:ring-2"
            >
              Set up
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

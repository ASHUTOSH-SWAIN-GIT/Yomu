import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Square, X } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { ARTICLE_ACTIONS } from "@/lib/quick-actions";
import { cn } from "@/lib/utils";
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
  const setChatOpen = useUiStore((s) => s.setChatOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const ready = useAgentStore((s) => s.status) === "ready";

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const waiting =
    streaming && messages[messages.length - 1]?.role !== "assistant";

  // Keep the newest words in view while a reply streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

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

  return (
    <aside
      aria-label="Chat about this article"
      className="bg-background border-border flex h-full w-[26rem] max-w-[45%] shrink-0 flex-col border-l"
    >
      <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <h2 className="text-[0.8125rem] font-medium">Chat</h2>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[0.75rem]">
          {article.title}
        </span>
        <button
          type="button"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 grid size-7 shrink-0 place-items-center outline-none focus-visible:ring-2"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground text-[0.8125rem]">
            <p>Ask anything about this article.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ARTICLE_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={streaming}
                  onClick={() => send(a.message)}
                  className="border-border hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 h-8 border px-3 text-[0.75rem] outline-none focus-visible:ring-2"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "text-[0.875rem] leading-relaxed",
                  m.role === "user" && "bg-muted ml-8 px-3 py-2",
                )}
              >
                {m.quote && (
                  <p className="text-muted-foreground border-border mb-1.5 line-clamp-2 border-l-2 pl-2 text-[0.75rem] italic">
                    {m.quote}
                  </p>
                )}
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ) : (
                  <Markdown>{m.text}</Markdown>
                )}
              </li>
            ))}
            {waiting && (
              <li className="text-muted-foreground animate-pulse text-[0.8125rem]">
                Thinking…
              </li>
            )}
          </ul>
        )}
        {error && (
          <div
            role="alert"
            className="text-destructive border-destructive/40 mt-4 flex flex-col gap-2 border px-3 py-2.5 text-[0.8125rem]"
          >
            {error.message}
            <button
              type="button"
              onClick={() =>
                error.kind === "logged_out" || error.kind === "adapter_missing"
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

      <form onSubmit={onSubmit} className="border-border shrink-0 border-t p-3">
        <div className="bg-card focus-within:ring-ring/40 flex items-end gap-2 p-2 shadow-[var(--shadow-card)] focus-within:ring-2">
          <textarea
            id="chat-input"
            autoFocus
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
              ready ? "Ask about this article…" : "Set up Explain to chat"
            }
            aria-label="Message"
            className="placeholder:text-muted-foreground field-sizing-content max-h-32 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[0.875rem] outline-none disabled:opacity-60"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              aria-label="Stop"
              className="bg-secondary hover:bg-accent focus-visible:ring-ring/60 grid size-8 shrink-0 place-items-center outline-none focus-visible:ring-2"
            >
              <Square className="size-3" aria-hidden />
            </button>
          ) : ready ? (
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send"
              className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground focus-visible:ring-ring/60 grid size-8 shrink-0 place-items-center outline-none focus-visible:ring-2"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="bg-primary text-primary-foreground focus-visible:ring-ring/60 h-8 shrink-0 px-3 text-[0.75rem] font-medium outline-none focus-visible:ring-2"
            >
              Set up
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}

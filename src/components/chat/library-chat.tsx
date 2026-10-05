import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, Copy, Square } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";

const IDEAS = [
  "What have I saved about databases?",
  "Summarize my most recent reads",
  "Which of my articles disagree with each other?",
];

/** The universal chat page: one big box in the middle of the page, for
 * talking with everything you have saved. Once the conversation
 * starts, the box moves to the bottom. */
export function LibraryChat() {
  const messages = useLibraryChatStore((s) => s.messages);
  const streaming = useLibraryChatStore((s) => s.streaming);
  const error = useLibraryChatStore((s) => s.error);
  const ask = useLibraryChatStore((s) => s.ask);
  const stop = useLibraryChatStore((s) => s.stop);
  const retry = useLibraryChatStore((s) => s.retry);
  const count = useLibraryStore((s) => s.articles.length);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const ready = useAgentStore((s) => s.status) === "ready";

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;
  const waiting =
    streaming && messages[messages.length - 1]?.role !== "assistant";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

  function send(question: string) {
    if (!question.trim() || streaming) return;
    if (!ready) return setSetupOpen(true);
    void ask(question);
    setText("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  const box = (
    <form onSubmit={onSubmit} className="w-full">
      <div
        className={cn(
          "bg-card border-border focus-within:border-input flex items-end gap-2 rounded-3xl border py-2 pr-2 pl-5 transition-colors",
          started
            ? "shadow-[var(--shadow-card)]"
            : "shadow-[var(--shadow-float)]",
        )}
      >
        <textarea
          id="library-chat-input"
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
            ready ? "Ask anything about your blogs" : "Set up Explain to chat"
          }
          aria-label="Message"
          className={cn(
            "placeholder:text-muted-foreground field-sizing-content max-h-52 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-[0.9375rem] leading-6 outline-none disabled:opacity-60",
            !started && "min-h-14",
          )}
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop"
            className="bg-primary text-primary-foreground focus-visible:ring-ring/60 mb-0.5 grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
          >
            <Square className="size-3 fill-current" aria-hidden />
          </button>
        ) : ready ? (
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground focus-visible:ring-ring/60 mb-0.5 grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="bg-primary text-primary-foreground focus-visible:ring-ring/60 mb-0.5 h-9 shrink-0 rounded-full px-4 text-[0.8125rem] font-medium outline-none focus-visible:ring-2"
          >
            Set up
          </button>
        )}
      </div>
    </form>
  );

  const context = (
    <p className="text-muted-foreground text-center text-[0.75rem]">
      Answers use your {count} saved {count === 1 ? "article" : "articles"}.
    </p>
  );

  if (!started) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-[52rem] flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="mb-8 text-center text-[1.875rem] font-medium tracking-[-0.02em]">
          What do you want to know?
        </h1>
        {box}
        <div className="mt-3">{context}</div>
        {error && <ErrorNote error={error} onRetry={retry} />}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => send(idea)}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 h-9 rounded-full border px-4 text-[0.8125rem] outline-none focus-visible:ring-2"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <ul className="mx-auto flex w-full max-w-[52rem] flex-col gap-7 pb-8">
          {messages.map((m, i) =>
            m.role === "user" ? (
              // Yours: a bubble on the right, as wide as the message.
              <li key={i} className="flex justify-end">
                <p className="bg-muted max-w-[80%] rounded-3xl px-5 py-2.5 text-[0.9375rem] leading-6 whitespace-pre-wrap">
                  {m.text}
                </p>
              </li>
            ) : (
              // The agent's: plain text on the page, with a copy button.
              <li key={i} className="group text-[0.9375rem] leading-7">
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
              className="text-muted-foreground flex gap-1 py-2"
            >
              {[0, 150, 300].map((delay) => (
                <i
                  key={delay}
                  className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </li>
          )}
          {error && <ErrorNote error={error} onRetry={retry} />}
          <div ref={endRef} />
        </ul>
      </div>
      <div className="mx-auto w-full max-w-[52rem] shrink-0 px-6 pb-4">
        {box}
        <div className="mt-2">{context}</div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy reply"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 mt-1 grid size-7 place-items-center rounded-md opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

function ErrorNote({
  error,
  onRetry,
}: {
  error: { kind: string; message: string };
  onRetry: () => Promise<void>;
}) {
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const needsSetup =
    error.kind === "logged_out" || error.kind === "adapter_missing";
  return (
    <div
      role="alert"
      className="text-destructive border-destructive/40 mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-[0.8125rem]"
    >
      {error.message}
      <button
        type="button"
        onClick={() => (needsSetup ? setSetupOpen(true) : void onRetry())}
        className="self-start font-medium underline underline-offset-2"
      >
        {needsSetup ? "Open setup" : "Try again"}
      </button>
    </div>
  );
}

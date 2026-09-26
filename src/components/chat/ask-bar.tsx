import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import { groupExchanges, pickExchange } from "@/lib/exchanges";
import { parseImageQuote } from "@/lib/images";
import { logError } from "@/lib/log";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiStore } from "@/stores/ui-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

// Quick prompts. With a fresh selection they are the first question about it;
// otherwise they are follow-ups in the open conversation.
const QUICK = [
  {
    label: "Simpler",
    prompt: "Explain that more simply, as if I'm new to this.",
  },
  {
    label: "Go deeper",
    prompt: "Go deeper: cover the details and edge cases.",
  },
  { label: "Example", prompt: "Show a short concrete example." },
];

/**
 * The Explain surface: a bar at the bottom of the article. Select text and it
 * offers to explain it or take your own question; the answer rises above it
 * as a sheet. It replaces the old side chat panel. Everything runs through
 * the chat store, so history, resume and regenerate behave as before.
 */
export function AskBar() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const selection = useSelectionStore((s) => s.selection);
  const setSelection = useSelectionStore((s) => s.set);
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const explain = useChatStore((s) => s.explain);
  const askAbout = useChatStore((s) => s.askAbout);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const summarize = useChatStore((s) => s.summarize);
  const answerOpen = useUiStore((s) => s.answerOpen);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const agentStatus = useAgentStore((s) => s.status);

  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = agentStatus === "ready";
  const sheetVisible = answerOpen && messages.length > 0;

  /** Runs the current input: a new passage takes a question (or an explain),
   * otherwise it is a follow-up. */
  function run(prompt: string | null) {
    if (!article || streaming) return;
    const typed = (prompt ?? text).trim();
    if (selection) {
      if (typed) void askAbout(article, selection, typed);
      else void explain(article, selection);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } else if (typed) {
      void send(article, typed);
      setAnswerOpen(true);
    }
    setText("");
  }

  // Cmd/Ctrl+E: explain the selection, or jump to the input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      e.preventDefault();
      if (!ready) return setSetupOpen(true);
      if (selection && article) run(null);
      else inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!article) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(null);
  }

  const hasSelection = selection !== null;
  const showBar = hasSelection || sheetVisible;
  const quote = selection
    ? (parseImageQuote(selection.text)?.alt ?? selection.text)
    : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-3 px-6">
      {sheetVisible && <AnswerSheet />}

      {showBar ? (
        <form
          onSubmit={onSubmit}
          aria-label="Ask about this article"
          className="rise-in pointer-events-auto flex w-[min(42.5rem,100%)] items-center gap-2.5 rounded-xl bg-black p-1.5 pl-3 text-white shadow-[var(--shadow-float)] ring-1 ring-white/25"
        >
          {quote && (
            <span className="flex h-7 max-w-[14rem] shrink-0 items-center gap-2 rounded-md border border-white/20 px-2 font-serif text-[0.75rem] italic">
              <i aria-hidden className="hidden" />
              <span className="truncate">“{quote}”</span>
            </span>
          )}

          {ready ? (
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText("");
                  setSelection(null);
                  e.currentTarget.blur();
                }
              }}
              disabled={streaming}
              placeholder={
                hasSelection ? "Ask about this…" : "Ask a follow-up…"
              }
              aria-label={
                hasSelection
                  ? "Ask about the selected passage"
                  : "Ask a follow-up"
              }
              className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-white outline-none placeholder:text-white/50 disabled:opacity-60"
            />
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-white/80 underline decoration-white/30 underline-offset-4 outline-none hover:decoration-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Set up Explain to ask questions
            </button>
          )}

          {ready && !streaming && (
            <span className="hidden shrink-0 gap-1.5 md:flex">
              {QUICK.slice(hasSelection ? 0 : 0, hasSelection ? 2 : 3).map(
                (q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => run(q.prompt)}
                    className="h-7 rounded-md border border-white/20 px-2.5 text-[0.75rem] transition-colors outline-none hover:border-white/60 focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    {q.label}
                  </button>
                ),
              )}
            </span>
          )}

          {streaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/30 px-3 text-[0.75rem] font-medium outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Square className="size-3" aria-hidden /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!ready || (!hasSelection && !text.trim())}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[0.75rem] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
            >
              {hasSelection && !text.trim() ? "Explain" : "Ask"}
              <kbd className="px-0.5 font-sans text-[0.6875rem] opacity-60">
                {MOD}↵
              </kbd>
            </button>
          )}
        </form>
      ) : (
        <div className="text-muted-foreground bg-background border-border pointer-events-auto flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[0.75rem]">
          <span className="flex items-center gap-2">
            <Sparkles className="size-3.5" aria-hidden />
            Select any passage to ask about it
            <kbd className="text-foreground font-sans text-[0.6875rem]">
              {MOD}E
            </kbd>
          </span>
          {ready && messages.length === 0 && (
            <button
              type="button"
              onClick={() => void summarize(article)}
              className="hover:text-foreground focus-visible:ring-ring/60 rounded underline underline-offset-4 outline-none focus-visible:ring-2"
            >
              or summarize the article
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The answer above the bar: the latest exchange (or the one for a clicked
 * passage), with copy, regenerate and history. */
function AnswerSheet() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const regenerate = useChatStore((s) => s.regenerate);
  const retry = useChatStore((s) => s.retry);
  const answerFocus = useUiStore((s) => s.answerFocus);
  const setAnswerFocus = useUiStore((s) => s.setAnswerFocus);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const exchanges = groupExchanges(messages);
  const current = pickExchange(exchanges, answerFocus);
  const latest = exchanges[exchanges.length - 1] === current;
  const answer = current?.answers[current.answers.length - 1];

  // Follow the answer as it streams.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, error, history]);

  if (!current) return null;

  const title = current.question.summary
    ? "Summary"
    : current.question.quote && parseImageQuote(current.question.quote)
      ? "About this image"
      : "Explained";

  async function copy() {
    if (!answer?.text) return;
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logError("copy failed", err);
    }
  }

  return (
    <section
      aria-label="Answer"
      className="rise-in bg-popover text-popover-foreground border-border pointer-events-auto flex max-h-[min(26rem,50vh)] w-[min(42.5rem,100%)] flex-col rounded-xl border shadow-[var(--shadow-float)]"
    >
      <header className="flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-2 text-[0.75rem] font-medium">
        <i aria-hidden className="bg-foreground size-1.5 rounded-full" />
        {title}
        <span className="ml-auto flex items-center gap-1 font-medium">
          {exchanges.length > 1 && (
            <button
              type="button"
              aria-pressed={history}
              onClick={() => setHistory((v) => !v)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.8125rem] outline-none focus-visible:ring-2"
            >
              <History className="size-3.5" aria-hidden />
              History · {exchanges.length}
            </button>
          )}
          <button
            type="button"
            aria-label="Close answer"
            onClick={() => setAnswerOpen(false)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-md p-1 outline-none focus-visible:ring-2"
          >
            <X className="size-4" />
          </button>
        </span>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-2"
        role="log"
        aria-live="polite"
      >
        {history ? (
          <ol className="flex flex-col gap-4 pb-1">
            {exchanges.map((e, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setAnswerFocus(e.question.highlightId ?? null);
                    setHistory(false);
                  }}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 w-full rounded text-left text-[0.8125rem] outline-none focus-visible:ring-2"
                >
                  {e.question.quote && (
                    <span className="border-border mb-1 line-clamp-2 block border-l pl-2.5 font-serif italic">
                      {parseImageQuote(e.question.quote)?.alt ||
                        e.question.quote}
                    </span>
                  )}
                  <span className="font-semibold">{e.question.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {current.question.quote && (
              <blockquote className="border-foreground text-muted-foreground mb-3 line-clamp-3 border-l pl-3 font-serif text-[0.8125rem] italic">
                {parseImageQuote(current.question.quote)?.alt ||
                  current.question.quote}
              </blockquote>
            )}
            {!current.question.summary &&
              current.question.text !== "Explain this" &&
              !parseImageQuote(current.question.quote ?? "") && (
                <p className="mb-2 text-[0.8125rem] font-medium">
                  {current.question.text}
                </p>
              )}
            <div className="font-serif text-[0.9375rem] leading-[1.7]">
              {answer?.text ? (
                <Markdown>{answer.text}</Markdown>
              ) : streaming && latest ? (
                <Loader2
                  className="text-muted-foreground size-4 animate-spin"
                  aria-label="Thinking"
                />
              ) : null}
              {streaming && latest && answer?.text && (
                <span
                  aria-hidden
                  className="text-muted-foreground animate-pulse"
                >
                  ▍
                </span>
              )}
            </div>
          </>
        )}

        {error && latest && (
          <div className="border-destructive/40 text-destructive mt-3 flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-[0.75rem]">
            <p>{error.message}</p>
            {error.kind !== "logged_out" && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => void retry()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!history && answer?.text && (
        <footer className="border-border flex shrink-0 items-center gap-2 border-t px-4 pt-2 pb-2.5">
          <SheetButton onClick={() => void copy()}>
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </SheetButton>
          {latest && article && (
            <SheetButton
              disabled={streaming}
              onClick={() => void regenerate(article)}
            >
              <RefreshCw className="size-3.5" />
              Regenerate
            </SheetButton>
          )}
        </footer>
      )}
    </section>
  );
}

function SheetButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "bg-muted hover:bg-accent focus-visible:ring-ring/60 inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[0.8125rem] font-semibold outline-none focus-visible:ring-2 disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

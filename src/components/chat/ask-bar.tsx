import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import { rangeInBlock } from "@/hooks/use-highlights";
import { useChatStore, type Selection } from "@/stores/chat-store";
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
 * The Explain surface. Selecting text opens a small toolbar right above the
 * passage (explain it, or type a question); answers go to the margin, or to
 * a sheet above a bottom bar when the window is too narrow for one. The
 * bottom bar also takes follow-ups. Everything runs through the chat store.
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
  const answerOpen = useUiStore((s) => s.answerOpen);
  const notesInMargin = useUiStore((s) => s.notesInMargin);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const agentStatus = useAgentStore((s) => s.status);

  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = agentStatus === "ready";
  const followUpOpen = answerOpen && messages.length > 0;
  const sheetVisible = followUpOpen && !notesInMargin;

  /** Runs a question: about the selected passage if there is one (an
   * explanation when empty), otherwise a follow-up. */
  function run(prompt: string | null, typedText = text) {
    if (!article || streaming) return;
    const typed = (prompt ?? typedText).trim();
    if (!ready) return setSetupOpen(true);
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

  // Cmd/Ctrl+E: explain the selection, or jump to the follow-up input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      e.preventDefault();
      if (!ready) return setSetupOpen(true);
      if (selection && article) run(null);
      else if (messages.length > 0) {
        setAnswerOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!article) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(null);
  }

  return (
    <>
      {selection && (
        <SelectionToolbar
          key={`${selection.blockIndex}:${selection.startOffset}:${selection.endOffset}`}
          selection={selection}
          ready={ready}
          streaming={streaming}
          onRun={(prompt, typed) => run(prompt, typed)}
          onClose={() => {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {(sheetVisible || (followUpOpen && !selection)) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2.5 px-6">
          {sheetVisible && <AnswerSheet />}
          <form
            onSubmit={onSubmit}
            aria-label="Ask a follow-up"
            className="rise-in bg-popover text-popover-foreground focus-within:ring-ring/40 pointer-events-auto flex w-[min(38rem,100%)] items-center gap-2 rounded-2xl p-1.5 pl-4 shadow-[var(--shadow-float)] focus-within:ring-2"
          >
            <input
              id="ask-input"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText("");
                  setAnswerOpen(false);
                }
              }}
              disabled={streaming || !ready}
              placeholder={ready ? "Ask a follow-up…" : "Set up Explain to ask"}
              aria-label="Ask a follow-up"
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none disabled:opacity-60"
            />
            {ready && !streaming && (
              <span className="hidden shrink-0 gap-1.5 md:flex">
                {QUICK.map((q) => (
                  <QuickButton key={q.label} onClick={() => run(q.prompt)}>
                    {q.label}
                  </QuickButton>
                ))}
              </span>
            )}
            {streaming ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="bg-secondary hover:bg-accent focus-visible:ring-ring/60 flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[0.8125rem] font-medium outline-none focus-visible:ring-2"
              >
                <Square className="size-3" aria-hidden /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!ready || !text.trim()}
                className="bg-primary text-primary-foreground focus-visible:ring-ring/60 disabled:bg-secondary disabled:text-muted-foreground flex h-9 shrink-0 items-center rounded-xl px-4 text-[0.8125rem] font-semibold outline-none focus-visible:ring-2"
              >
                Ask
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function QuickButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 h-8 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2"
    >
      {children}
    </button>
  );
}

/** Where the selected passage is on screen, kept current while scrolling. */
function useSelectionRect(selection: Selection): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    function measure() {
      const block = document.querySelector<HTMLElement>(
        `article [data-block-index="${selection.blockIndex}"]`,
      );
      const range =
        block &&
        rangeInBlock(block, selection.startOffset, selection.endOffset);
      setRect(range ? range.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [selection]);
  return rect;
}

/** The small toolbar above a fresh selection: Explain in one click, or type
 * your own question about the passage. */
function SelectionToolbar({
  selection,
  ready,
  streaming,
  onRun,
  onClose,
}: {
  selection: Selection;
  ready: boolean;
  streaming: boolean;
  onRun: (prompt: string | null, typed: string) => void;
  onClose: () => void;
}) {
  const rect = useSelectionRect(selection);
  const formRef = useRef<HTMLFormElement>(null);
  const [measured, setMeasured] = useState(268);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const isImage = parseImageQuote(selection.text) !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (formRef.current && !asking) setMeasured(formRef.current.offsetWidth);
  }, [asking, ready, rect]);

  if (!rect || isImage) return null;

  const width = asking ? 360 : measured;
  const below = rect.top < 100;
  const top = below ? rect.bottom + 10 : rect.top - 46;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, 12),
    window.innerWidth - width - 12,
  );

  return (
    <form
      ref={formRef}
      role="dialog"
      aria-label="Ask about the selected passage"
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
      onSubmit={(e) => {
        e.preventDefault();
        onRun(null, question);
      }}
      className="pop-in bg-popover text-popover-foreground fixed z-30 flex h-10 items-center gap-0.5 rounded-xl p-1 shadow-[var(--shadow-float)]"
      style={{ top, left, width: asking ? width : undefined }}
    >
      {asking ? (
        <>
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this passage…"
            aria-label="Your question about the passage"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-2 text-[0.8125rem] outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim() || streaming}
            className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground h-8 shrink-0 rounded-lg px-3 text-[0.8125rem] font-semibold outline-none"
          >
            Ask
          </button>
        </>
      ) : (
        <>
          <button
            type="submit"
            disabled={streaming}
            className="bg-primary text-primary-foreground focus-visible:ring-ring/60 flex h-8 items-center gap-1.5 rounded-lg pr-2.5 pl-2 text-[0.8125rem] font-semibold outline-none focus-visible:ring-2 disabled:opacity-40"
          >
            <Sparkles className="text-honey size-3.5" aria-hidden />
            {ready ? "Explain" : "Set up Explain"}
            {ready && (
              <kbd className="font-sans text-[0.6875rem] opacity-50">
                {MOD}E
              </kbd>
            )}
          </button>
          {ready && (
            <>
              <QuickButton onClick={() => setAsking(true)}>Ask…</QuickButton>
              <QuickButton onClick={() => onRun(QUICK[0].prompt, "")}>
                Simpler
              </QuickButton>
              <QuickButton onClick={() => onRun(QUICK[2].prompt, "")}>
                Example
              </QuickButton>
            </>
          )}
        </>
      )}
    </form>
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
      className="rise-in bg-popover text-popover-foreground pointer-events-auto flex max-h-[min(26rem,50vh)] w-[min(42.5rem,100%)] flex-col rounded-2xl shadow-[var(--shadow-float)]"
    >
      <header className="flex shrink-0 items-center gap-2 px-5 pt-3.5 pb-2 text-[0.75rem] font-medium">
        <Sparkles aria-hidden className="text-honey-ink size-3.5" />
        {title}
        <span className="ml-auto flex items-center gap-1 font-medium">
          {exchanges.length > 1 && (
            <button
              type="button"
              aria-pressed={history}
              onClick={() => setHistory((v) => !v)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.6875rem] outline-none focus-visible:ring-1"
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
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-2"
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
              <blockquote className="border-honey text-muted-foreground mb-3 line-clamp-3 border-l-2 pl-3 font-serif text-[0.875rem] italic">
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
            <div className="text-[0.875rem] leading-[1.65] text-[var(--reader-ink)]">
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
        <footer className="border-border flex shrink-0 items-center gap-1 border-t px-3.5 py-2">
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
        "text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.75rem] font-medium outline-none focus-visible:ring-2 disabled:opacity-50 [&>svg]:size-3.5",
      )}
    >
      {children}
    </button>
  );
}

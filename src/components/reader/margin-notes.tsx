import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { groupExchanges, type Exchange } from "@/lib/exchanges";
import { parseImageQuote } from "@/lib/images";
import { logError } from "@/lib/log";
import { isThreadScope } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { rangeInBlock } from "@/hooks/use-highlights";
import { useChatStore } from "@/stores/chat-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiStore } from "@/stores/ui-store";
import type { Highlight, StoredArticle } from "@/types/library";

const GAP = 14; // px between stacked notes
const COLLAPSED_MAX = 176; // px before a note folds

/** One note: a passage and every exchange about it, including follow-ups
 * asked after it. */
interface Thread {
  key: string;
  highlight: Highlight;
  exchanges: Exchange[];
}

function buildThreads(
  exchanges: Exchange[],
  highlights: Highlight[],
): Thread[] {
  const byId = new Map(highlights.map((h) => [h.id, h]));
  const threads: Thread[] = [];
  for (const e of exchanges) {
    // Article and library questions live in the thread sheet, not here.
    if (isThreadScope(e.question.scope)) continue;
    const h = e.question.highlightId
      ? byId.get(e.question.highlightId)
      : undefined;
    if (h) {
      threads.push({ key: h.id, highlight: h, exchanges: [e] });
    } else {
      // A follow-up belongs to the note it was asked after.
      threads[threads.length - 1]?.exchanges.push(e);
    }
  }
  return threads;
}

/**
 * Answers written in the margin beside the passage they explain, like notes
 * in a book. Each note is placed level with its passage and pushed down if it
 * would overlap the one above; a small number in the text ties the two
 * together. Positions are measured from the live layout, so they follow
 * font, size and width changes.
 */
export function MarginNotes({
  article,
  containerRef,
  textRef,
}: {
  article: StoredArticle;
  containerRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
}) {
  const messages = useChatStore((s) => s.messages);
  const highlights = useChatStore((s) => s.highlights);
  const streaming = useChatStore((s) => s.streaming);
  const answerFocus = useUiStore((s) => s.answerFocus);

  const threads = useMemo(
    () => buildThreads(groupExchanges(messages), highlights),
    [messages, highlights],
  );
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const ranges = useRef(new Map<string, Range>());
  const [hovered, setHovered] = useState<string | null>(null);

  const [layout, setLayout] = useState<{
    notes: Record<string, number>;
    marks: { key: string; n: number; x: number; y: number }[];
  }>({ notes: {}, marks: [] });
  const [tick, setTick] = useState(0);

  // Light up the passage of the note being pointed at (or read).
  const activeKey =
    hovered ?? threads.find((t) => t.highlight.id === answerFocus)?.key ?? null;
  useLayoutEffect(() => {
    if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
    const range = activeKey ? ranges.current.get(activeKey) : undefined;
    if (range) CSS.highlights.set("yomu-active", new Highlight(range));
    else CSS.highlights.delete("yomu-active");
    return () => void CSS.highlights.delete("yomu-active");
  }, [activeKey, layout]);

  // Re-measure whenever the text reflows (width, font, images loading) or a
  // note changes height (streaming, folding).
  const observer = useMemo(
    () => new ResizeObserver(() => setTick((t) => t + 1)),
    [],
  );
  useLayoutEffect(() => {
    const text = textRef.current;
    if (text) observer.observe(text);
    return () => observer.disconnect();
  }, [textRef, observer]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    const origin = container.getBoundingClientRect();

    ranges.current.clear();
    const anchored = threads.map((t) => {
      const block = text.querySelector<HTMLElement>(
        `[data-block-index="${t.highlight.blockIndex}"]`,
      );
      const range =
        block &&
        rangeInBlock(block, t.highlight.startOffset, t.highlight.endOffset);
      if (range) ranges.current.set(t.key, range);
      const rects = range?.getClientRects();
      const first = rects?.[0];
      const last = rects?.[rects.length - 1];
      return {
        t,
        y: first ? first.top - origin.top : 0,
        rect: last ?? null,
      };
    });
    anchored.sort((a, b) => a.y - b.y);

    const notes: Record<string, number> = {};
    const marks: { key: string; n: number; x: number; y: number }[] = [];
    let floor = 0;
    let n = 0;
    for (const { t, y, rect } of anchored) {
      const top = Math.max(y, floor);
      notes[t.key] = top;
      const height = noteRefs.current.get(t.key)?.offsetHeight ?? 0;
      floor = top + height + GAP;
      if (rect) {
        n += 1;
        marks.push({
          key: t.key,
          n,
          x: rect.right - origin.left,
          y: rect.top - origin.top,
        });
      }
    }

    setLayout((prev) =>
      JSON.stringify(prev) === JSON.stringify({ notes, marks })
        ? prev
        : { notes, marks },
    );
  }, [threads, tick, answerFocus, streaming, containerRef, textRef]);

  const numberOf = new Map(layout.marks.map((m) => [m.key, m.n]));
  const latestKey = threads[threads.length - 1]?.key;

  return (
    <>
      {layout.marks.map((m) => (
        <sup
          key={m.key}
          aria-hidden
          className="bg-honey text-primary-foreground pointer-events-none absolute grid h-[14px] min-w-[14px] place-items-center rounded-full px-1 font-sans text-[0.5625rem] leading-none font-bold"
          style={{ left: m.x + 1, top: m.y - 9 }}
        >
          {m.n}
        </sup>
      ))}
      <aside
        aria-label="Notes"
        className="absolute top-0 right-0 w-[var(--margin-w)]"
      >
        {threads.length === 0 && <EmptyMargin />}
        {threads.map((t) => (
          <Note
            key={t.key}
            ref={(el) => {
              const prev = noteRefs.current.get(t.key);
              if (prev && prev !== el) observer.unobserve(prev);
              if (el) {
                noteRefs.current.set(t.key, el);
                observer.observe(el);
              } else noteRefs.current.delete(t.key);
            }}
            thread={t}
            onHover={(on) => setHovered(on ? t.key : null)}
            number={numberOf.get(t.key)}
            top={layout.notes[t.key]}
            latest={t.key === latestKey}
            focused={
              answerFocus === t.highlight.id ||
              (t.key === latestKey && streaming)
            }
            article={article}
          />
        ))}
      </aside>
    </>
  );
}

function Note({
  ref,
  onHover,
  thread,
  number,
  top,
  latest,
  focused,
  article,
}: {
  ref: (el: HTMLElement | null) => void;
  onHover: (on: boolean) => void;
  thread: Thread;
  number: number | undefined;
  top: number | undefined;
  latest: boolean;
  focused: boolean;
  article: StoredArticle;
}) {
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const regenerate = useChatStore((s) => s.regenerate);
  const retry = useChatStore((s) => s.retry);
  const setAnswerFocus = useUiStore((s) => s.setAnswerFocus);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  const open = expanded || focused;
  const last = thread.exchanges[thread.exchanges.length - 1];
  const lastAnswer = last?.answers[last.answers.length - 1];
  const busy = latest && streaming;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > COLLAPSED_MAX + 4);
  }, [thread, open]);

  async function copy() {
    const text = thread.exchanges
      .map((e) => e.answers[e.answers.length - 1]?.text ?? "")
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logError("copy failed", err);
    }
  }

  function followUp() {
    setAnswerFocus(thread.highlight.id);
    setAnswerOpen(true);
    useSelectionStore
      .getState()
      .setReplyTo({ highlightId: thread.highlight.id, number: number ?? 0 });
    requestAnimationFrame(() => document.getElementById("ask-input")?.focus());
  }

  const isImage = parseImageQuote(thread.highlight.text) !== null;

  return (
    <section
      ref={ref}
      aria-label={`Note ${number ?? ""}`}
      onClick={() => setAnswerFocus(thread.highlight.id)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "absolute -inset-x-3.5 rounded-xl px-3.5 py-3 transition-[top,background-color,box-shadow] duration-[var(--dur)] ease-[var(--ease)]",
        focused
          ? "bg-card shadow-[var(--shadow-card-hover)]"
          : "hover:shadow-[inset_0_0_0_1px_var(--border)]",
        top === undefined && "invisible",
      )}
      style={{ top: top ?? 0 }}
    >
      <p className="text-muted-foreground mb-2 flex items-center gap-2 font-sans text-[0.6875rem] font-medium">
        <span className="bg-honey text-primary-foreground grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.625rem] font-bold tabular-nums">
          {number ?? "·"}
        </span>
        {isImage ? "About this image" : "Note"}
      </p>

      <div
        ref={bodyRef}
        className={cn(
          "relative overflow-hidden font-sans text-[0.8125rem] leading-[1.6] text-[var(--reader-ink)]",
          !open && "max-h-[11rem]",
        )}
      >
        {thread.exchanges.map((e, i) => {
          const answer = e.answers[e.answers.length - 1];
          const ownQuestion =
            e.question.text !== "Explain this" &&
            !parseImageQuote(e.question.quote ?? "");
          return (
            <div
              key={i}
              className={cn(
                i > 0 && "border-border mt-3 border-t border-dashed pt-3",
              )}
            >
              {ownQuestion && (
                <p className="text-foreground mb-1.5 font-semibold">
                  {e.question.text}
                </p>
              )}
              {answer?.text ? (
                <>
                  <Markdown>{answer.text}</Markdown>
                  {busy && i === thread.exchanges.length - 1 && (
                    <span
                      aria-hidden
                      className="bg-honey ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse"
                    />
                  )}
                </>
              ) : busy && i === thread.exchanges.length - 1 ? (
                <Loader2
                  className="text-muted-foreground size-3.5 animate-spin"
                  aria-label="Thinking"
                />
              ) : null}
            </div>
          );
        })}
        {!open && overflows && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(transparent,var(--background))]"
          />
        )}
      </div>

      {latest && error && (
        <div className="text-destructive mt-2 text-[0.72rem]">
          <p>{error.message}</p>
          {error.kind !== "logged_out" && (
            <NoteAction onClick={() => void retry()}>Try again</NoteAction>
          )}
        </div>
      )}

      <div className="text-muted-foreground mt-2 -ml-1.5 flex flex-wrap gap-0.5 text-[0.6875rem] font-medium">
        {!open && overflows && (
          <NoteAction onClick={() => setExpanded(true)}>Read all</NoteAction>
        )}
        {expanded && !focused && (
          <NoteAction onClick={() => setExpanded(false)}>Fold</NoteAction>
        )}
        {lastAnswer?.text && !busy && (
          <>
            <NoteAction onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </NoteAction>
            {latest && (
              <>
                <NoteAction onClick={() => void regenerate(article)}>
                  Regenerate
                </NoteAction>
                <NoteAction onClick={followUp}>Follow up</NoteAction>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Before the first question, the margin says what it is for. */
function EmptyMargin() {
  return (
    <div className="text-muted-foreground sticky top-6 -mx-3.5 mt-[5.5rem] rounded-xl px-3.5 py-3.5 text-[0.75rem] leading-[1.6] shadow-[inset_0_0_0_1px_var(--border)]">
      <p className="text-foreground mb-1 flex items-center gap-2 font-medium">
        <Sparkles className="text-honey-ink size-3.5" aria-hidden />
        Your margin
      </p>
      <p>
        Select any passage, then ask below. Answers are written here, beside the
        text they explain.
      </p>
    </div>
  );
}

function NoteAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 h-6 rounded-md px-1.5 outline-none focus-visible:ring-2"
    >
      {children}
    </button>
  );
}

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { BlockRenderer } from "@/components/reader/block-renderer";
import { useReadingProgress } from "@/hooks/use-reading-progress";
import { useHighlights } from "@/hooks/use-highlights";
import { Home } from "@/components/layout/home";
import { MarginNotes } from "@/components/reader/margin-notes";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useUiStore } from "@/stores/ui-store";
import { useScrollProgress } from "@/hooks/use-scroll-progress";
import { formatRelativeTime } from "@/lib/format";
import { readingMinutes } from "@/lib/reading";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

// Below this reading-area width the margin can't fit beside the text, so
// answers go to the sheet above the Ask bar instead.
const MARGIN_MIN_WIDTH = 1040;

export function ReaderView() {
  const state = useReaderStore((s) => s.state);
  const scrollRef = useRef<HTMLElement>(null);
  const setNotesInMargin = useUiStore((s) => s.setNotesInMargin);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setNotesInMargin(el.clientWidth >= MARGIN_MIN_WIDTH),
    );
    observer.observe(el);
    const onScroll = () =>
      useUiStore.getState().setPastTitle(el.scrollTop > 140);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [setNotesInMargin]);

  return (
    <main ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
      {state.status === "ready" ? (
        <>
          <ProgressLine scrollRef={scrollRef} articleId={state.article.id} />
          <Article article={state.article} scrollRef={scrollRef} />
        </>
      ) : state.status === "loading" ? (
        <Opening url={state.url} />
      ) : (
        <Home />
      )}
    </main>
  );
}

/** While an article is fetched: where it comes from, and the shape of the
 * page it will become, so the wait reads as progress rather than a stall. */
function Opening({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL yet; show it as typed.
  }
  return (
    <div
      role="status"
      aria-label={`Opening ${host}`}
      className="mx-auto w-full max-w-[var(--reader-measure)] px-8 pt-20"
      style={{ fontSize: "var(--reader-size)" }}
    >
      <div className="bg-honey absolute inset-x-0 top-0 z-10 h-[2px] origin-left animate-[yomu-load_1.4s_var(--ease)_infinite]" />
      <p className="text-muted-foreground flex items-center gap-2 font-sans text-[0.75rem] font-medium">
        <i aria-hidden className="bg-honey size-2 animate-pulse rounded-full" />
        Opening {host}…
      </p>
      <div className="mt-5 animate-pulse space-y-[0.9em]" aria-hidden>
        <div className="bg-secondary h-[1.6em] w-3/4 rounded-md" />
        <div className="bg-secondary h-[1.6em] w-1/2 rounded-md" />
        <div className="bg-secondary h-[0.6em] w-1/3 rounded" />
        <div className="h-4" />
        {[96, 100, 92, 98, 60].map((w, i) => (
          <div
            key={i}
            className="bg-secondary h-[0.75em] rounded"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** A 2px line at the top of the reading area showing how far through the
 * article you are. Decorative to sighted users, exposed as a progressbar. */
function ProgressLine({
  scrollRef,
  articleId,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  articleId: string;
}) {
  const progress = useScrollProgress(scrollRef, articleId);
  return (
    <div className="sticky top-0 z-10 h-[2px] w-full shrink-0">
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="bg-honey h-[2px] rounded-r-full transition-[width] duration-[var(--dur-fast)] ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

function Article({
  article,
  scrollRef,
}: {
  article: StoredArticle;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useReadingProgress(scrollRef, article.id, article.progress);
  useTextSelection(ref);
  const highlights = useChatStore((s) => s.highlights);
  const notesInMargin = useUiStore((s) => s.notesInMargin);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const setAnswerFocus = useUiStore((s) => s.setAnswerFocus);

  // Clicking a marked passage brings its note forward (in the margin) or
  // shows its answer above the Ask bar (narrow windows).
  const showExplanation = useCallback(
    (highlightId: string) => {
      setAnswerFocus(highlightId);
      if (!useUiStore.getState().notesInMargin) setAnswerOpen(true);
    },
    [setAnswerFocus, setAnswerOpen],
  );
  useHighlights(ref, highlights, showExplanation);

  const minutes = readingMinutes(article.blocks);

  return (
    <div
      className={notesInMargin ? "flex w-full justify-center px-10" : "w-full"}
    >
      {/* Text and margin as one unit; notes are measured against this box. */}
      <div
        ref={containerRef}
        className={notesInMargin ? "relative flex min-w-0 gap-16" : "relative"}
        style={{ "--margin-w": "16.5rem" } as React.CSSProperties}
      >
        <article
          ref={ref}
          // The reading preferences (typeface, size, width) are CSS variables set
          // from the Aa menu; `max-w` is in ch of *this* element's font.
          style={{
            fontFamily: "var(--reader-font)",
            fontSize: "var(--reader-size)",
            lineHeight: "var(--reader-leading)",
          }}
          className={
            notesInMargin
              ? "w-[var(--reader-measure)] max-w-full min-w-0 pt-20 pb-56"
              : "mx-auto w-full max-w-[var(--reader-measure)] px-8 pt-20 pb-56"
          }
        >
          <header className="mb-[2em]">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              title={article.url}
              className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 font-sans text-[0.75rem] leading-none font-medium"
            >
              <i aria-hidden className="bg-space size-2 rounded-full" />
              {article.site || new URL(article.url).hostname}
              <ArrowUpRight className="size-3 opacity-60" aria-hidden />
            </a>
            <h1 className="text-foreground font-serif text-[2em] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
              {article.title}
            </h1>
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-sans text-[0.8125rem] leading-normal">
              {article.author && (
                <span className="text-foreground font-medium">
                  {article.author}
                </span>
              )}
              {article.publishedAt ? (
                <span>Published {formatRelativeTime(article.publishedAt)}</span>
              ) : (
                <span>Saved {formatRelativeTime(article.scrapedAt)}</span>
              )}
              <span>{minutes} min read</span>
            </div>
            <div aria-hidden className="mt-7 flex items-center gap-2">
              <i className="bg-honey h-[3px] w-8 rounded-full" />
              <i className="bg-border h-px flex-1" />
            </div>
          </header>
          <BlockRenderer blocks={article.blocks} baseUrl={article.url} />
        </article>
        {notesInMargin && (
          <>
            <div aria-hidden className="w-[var(--margin-w)] shrink-0" />
            <div className="pointer-events-none absolute inset-0 [&_aside]:pointer-events-auto">
              <MarginNotes
                article={article}
                containerRef={containerRef}
                textRef={ref}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

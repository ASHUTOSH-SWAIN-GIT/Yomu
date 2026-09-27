import { useCallback, useEffect, useRef, type RefObject } from "react";
import { BlockRenderer } from "@/components/reader/block-renderer";
import { ArticleTools } from "@/components/reader/article-tools";
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
    return () => observer.disconnect();
  }, [setNotesInMargin]);

  return (
    <main ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
      {state.status === "ready" ? (
        <>
          <ProgressLine scrollRef={scrollRef} articleId={state.article.id} />
          <Article article={state.article} scrollRef={scrollRef} />
        </>
      ) : (
        <Home />
      )}
    </main>
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
    <div className="sticky top-0 z-10 h-px w-full shrink-0">
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="bg-foreground h-px transition-[width] duration-[var(--dur-fast)] ease-out"
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
        style={{ "--margin-w": "15rem" } as React.CSSProperties}
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
              ? "w-[var(--reader-measure)] max-w-full min-w-0 pt-16 pb-56"
              : "mx-auto w-full max-w-[var(--reader-measure)] px-6 pt-16 pb-56"
          }
        >
          <header className="border-border mb-[1.6em] border-b pb-[1.2em]">
            <h1 className="text-foreground text-[1.6em] leading-[1.2] font-medium tracking-[-0.015em] text-balance">
              {article.title}
            </h1>
            <div className="text-muted-foreground mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-sans text-[0.75rem] leading-normal">
              {article.author && (
                <span className="text-foreground">{article.author}</span>
              )}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                title={article.url}
                className="text-foreground decoration-muted-foreground hover:decoration-foreground underline underline-offset-2"
              >
                {article.site || new URL(article.url).hostname}
              </a>
              {article.publishedAt ? (
                <span>Published {formatRelativeTime(article.publishedAt)}</span>
              ) : (
                <span>Saved {formatRelativeTime(article.scrapedAt)}</span>
              )}
              <span>{minutes} min read</span>
            </div>
            <ArticleTools article={article} />
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

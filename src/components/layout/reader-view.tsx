import { useEffect, useRef, type RefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { BlockRenderer } from "@/components/reader/block-renderer";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useReadingProgress } from "@/hooks/use-reading-progress";
import { Home } from "@/components/layout/home";
import { useUiStore } from "@/stores/ui-store";
import { formatRelativeTime } from "@/lib/format";
import { readingMinutes } from "@/lib/reading";
import { useReaderStore } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

export function ReaderView() {
  const state = useReaderStore((s) => s.state);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const focusMode = useUiStore((s) => s.focusMode);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () =>
      useUiStore.getState().setPastTitle(el.scrollTop > 140);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex h-full">
      <main
        ref={scrollRef}
        className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto"
      >
        {state.status === "ready" ? (
          <Article article={state.article} scrollRef={scrollRef} />
        ) : (
          <Home />
        )}
      </main>
      {state.status === "ready" && chatOpen && !focusMode && <ChatPanel />}
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
  useReadingProgress(scrollRef, article.id, article.progress);

  const minutes = readingMinutes(article.blocks);

  return (
    <article
      // The reading preferences (typeface, size, width) are CSS variables set
      // from the Aa menu; `max-w` is in ch of *this* element's font.
      style={{
        fontFamily: "var(--reader-font)",
        fontSize: "var(--reader-size)",
        lineHeight: "var(--reader-leading)",
      }}
      className="mx-auto w-full max-w-[var(--reader-measure)] px-8 pt-20 pb-24"
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
  );
}

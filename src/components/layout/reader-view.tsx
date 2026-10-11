import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import { openPdfOriginal } from "@/lib/commands";
import { isPdfUrl, pdfShaOf } from "@/lib/pdf/identity";
import { PageBar, PageEnd, PageHead } from "@/components/reader/paper-pager";
import { usePaperPager } from "@/hooks/use-paper-pager";
import { BlockRenderer } from "@/components/reader/block-renderer";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatResizeHandle } from "@/components/chat/chat-resize-handle";
import { commentLayout } from "@/lib/reader-layout";
import { useReadingProgress } from "@/hooks/use-reading-progress";
import { cn } from "@/lib/utils";
import { Home } from "@/components/layout/home";
import { CitationLayer } from "@/components/reader/citations";
import { GlossaryLayer } from "@/components/reader/glossary";
import { Outline } from "@/components/reader/outline";
import { AddCommentButton, BlockComments } from "@/components/reader/comments";
import { useMarginStack } from "@/hooks/use-margin-stack";
import { useCommentHighlights } from "@/hooks/use-comment-highlights";
import { useCommentSelection } from "@/hooks/use-comment-selection";
import { useChatStore } from "@/stores/chat-store";
import { useCommentsStore } from "@/stores/comments-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";
import { readingMinutes } from "@/lib/reading";
import { useReaderStore } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

/** Below this window width the sidebar, article and chat do not all fit. */
const NARROW = 1100;

export function ReaderView() {
  const state = useReaderStore((s) => s.state);
  const chatOpen = useViewStore((s) => s.chatOpen);
  const chatFull = useViewStore((s) => s.chatFull);
  const chatWidth = useUiStore((s) => s.chatWidth);
  const [resizing, setResizing] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const focusMode = useUiStore((s) => s.focusMode);
  const scrollRef = useRef<HTMLElement>(null);
  const setPastTitle = useViewStore((s) => s.setPastTitle);

  // Opening the chat in a narrow window folds the docked sidebar away, so
  // the article keeps a readable width (⌘B brings it back). Only when the
  // chat is opened, not when a tab is drawn with it already open; and not
  // saved, so the next launch still has the sidebar.
  const chatWasOpen = useRef(chatOpen);
  useEffect(() => {
    if (chatOpen && !chatWasOpen.current && window.innerWidth < NARROW) {
      if (useUiStore.getState().sidebarOpen)
        useUiStore.setState({ sidebarOpen: false, sidebarPeek: false });
    }
    chatWasOpen.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setPastTitle(el.scrollTop > 140);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [setPastTitle]);

  return (
    <div ref={rowRef} className="flex h-full">
      <div className="relative h-full min-w-0 flex-1">
        <main ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
          {state.status === "ready" ? (
            <Article
              key={state.article.id}
              article={state.article}
              scrollRef={scrollRef}
            />
          ) : (
            <Home />
          )}
        </main>
        {state.status === "ready" && <ScrollBar scrollRef={scrollRef} />}
        {state.status === "ready" && !focusMode && (
          <Outline blocks={state.article.blocks} scrollRef={scrollRef} />
        )}
      </div>
      {state.status === "ready" && (
        // Always mounted so it can slide: the wrapper's width animates from
        // nothing to the panel width (or the whole page) and back.
        <div
          inert={!chatOpen || focusMode}
          className={cn(
            "relative shrink-0 overflow-hidden",
            // No easing while dragging, or the edge would trail the cursor.
            !resizing &&
              "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            !chatOpen || focusMode
              ? "w-0"
              : chatFull
                ? "w-full"
                : "max-w-[70%]",
          )}
          style={
            chatOpen && !focusMode && !chatFull
              ? { width: chatWidth }
              : undefined
          }
        >
          {chatOpen && !focusMode && !chatFull && (
            <ChatResizeHandle containerRef={rowRef} onResizing={setResizing} />
          )}
          <ChatPanel />
        </div>
      )}
    </div>
  );
}

/** A thin line along the top of the page that fills as you read down. It
 * writes the width straight to the element, so scrolling re-renders nothing. */
function ScrollBar({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (bar.current)
        bar.current.style.width = `${max > 0 ? (el.scrollTop / max) * 100 : 0}%`;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5"
    >
      <div ref={bar} className="bg-honey h-full w-0 rounded-r-full" />
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
  const paper = isPdfUrl(article.canonicalUrl);
  // A paper is read a page at a time; a blog scrolls.
  const pager = usePaperPager(article, scrollRef, paper);
  useReadingProgress(scrollRef, article.id, article.progress, !paper);
  const articleRef = useRef<HTMLElement>(null);
  const loadedFor = useCommentsStore((s) => s.articleId);
  const load = useCommentsStore((s) => s.load);
  const { selection, clear } = useCommentSelection(articleRef, scrollRef);
  useCommentHighlights(articleRef, pager?.index);

  useEffect(() => {
    if (loadedFor !== article.id) void load(article.id);
  }, [article.id, loadedFor, load]);

  // Comments go in the margin to the right of their paragraph. When the
  // window is too narrow for the article to stay centred and still leave
  // that margin, the article slides left just enough (`left` is its new left
  // margin); when there is no room even then, comments go under their
  // paragraph. Only these two small values are kept, so a resize never
  // re-renders more than it must.
  const hasAnswers = useChatStore((s) => s.highlights.length > 0);
  const hasComments =
    useCommentsStore((s) => s.items.length > 0 || s.draft !== null) ||
    hasAnswers;
  const [layout, setLayout] = useState<{
    beside: boolean;
    left: number | null;
  }>({ beside: false, left: null });
  useEffect(() => {
    const scroller = scrollRef.current;
    const el = articleRef.current;
    if (!scroller || !el) return;
    const measure = () => {
      const next = commentLayout(scroller.clientWidth - el.offsetWidth);
      setLayout((prev) =>
        prev.beside === next.beside && prev.left === next.left ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollRef]);
  const { beside } = layout;
  const comments = useCommentsStore((s) => s.items);
  const draft = useCommentsStore((s) => s.draft);
  const editingId = useCommentsStore((s) => s.editingId);
  // Notes in the margin must not run into each other.
  const highlights = useChatStore((s) => s.highlights);
  useMarginStack(articleRef, beside, [
    comments,
    draft,
    editingId,
    highlights,
    pager?.index,
  ]);
  const shiftLeft = hasComments && layout.left !== null ? layout.left : null;

  const minutes = readingMinutes(article.blocks);

  return (
    <>
      <article
        ref={articleRef}
        // The reading preferences (typeface, size, width) are CSS variables set
        // from the Aa menu; `max-w` is in ch of *this* element's font.
        style={{
          fontFamily: "var(--reader-font)",
          fontSize: "var(--reader-size)",
          lineHeight: "var(--reader-leading)",
          marginLeft: shiftLeft ?? undefined,
        }}
        className="mx-auto w-full max-w-[var(--reader-measure)] px-8 pt-20 pb-24 transition-[margin] duration-[var(--dur)] ease-[var(--ease)]"
      >
        {pager && pager.index > 0 ? (
          <PageHead pager={pager} title={article.title} />
        ) : (
          <header className="mb-[2em]">
            {paper ? (
              <button
                type="button"
                onClick={() => {
                  const sha = pdfShaOf(article.canonicalUrl);
                  if (sha) void openPdfOriginal(sha);
                }}
                title="Open the PDF in your PDF viewer"
                className="text-muted-foreground hover:text-foreground text-meta mb-4 inline-flex items-center gap-2 font-sans leading-none font-medium"
              >
                <FileText className="size-3.5" aria-hidden />
                PDF
                <ArrowUpRight className="size-3 opacity-60" aria-hidden />
              </button>
            ) : (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                title={article.url}
                className="text-muted-foreground hover:text-foreground text-meta mb-4 inline-flex items-center gap-2 font-sans leading-none font-medium"
              >
                <i aria-hidden className="bg-space size-2 rounded-full" />
                {article.site || new URL(article.url).hostname}
                <ArrowUpRight className="size-3 opacity-60" aria-hidden />
              </a>
            )}
            <h1 className="text-foreground font-serif text-[2em] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
              {article.title}
            </h1>
            <div className="text-muted-foreground text-ui mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-sans leading-normal">
              {article.author && (
                <span className="text-foreground font-medium">
                  {article.author}
                </span>
              )}
              <span>{minutes} min read</span>
              {pager && <span>{pager.pages.length} pages</span>}
            </div>
            <div aria-hidden className="mt-7 flex items-center gap-2">
              <i className="bg-honey h-[3px] w-8 rounded-full" />
              <i className="bg-border h-px flex-1" />
            </div>
          </header>
        )}
        <div
          // A new key on each turn replays the entrance.
          key={pager?.index ?? 0}
          className={cn(
            pager?.direction === "next" &&
              "motion-safe:animate-[yomu-page-next_260ms_cubic-bezier(0.32,0.72,0,1)]",
            pager?.direction === "prev" &&
              "motion-safe:animate-[yomu-page-prev_260ms_cubic-bezier(0.32,0.72,0,1)]",
          )}
        >
          <BlockRenderer
            blocks={article.blocks}
            baseUrl={article.url}
            range={pager ? [pager.page.start, pager.page.end] : undefined}
            aside={(index) => (
              <BlockComments
                blockIndex={index}
                beside={beside}
                articleRef={articleRef}
              />
            )}
          />
        </div>
        {pager && <PageEnd pager={pager} article={article} />}
      </article>
      {pager && <PageBar pager={pager} />}
      <GlossaryLayer
        articleRef={articleRef}
        articleId={article.id}
        blocks={article.blocks}
        page={pager?.index}
      />
      {paper && (
        <CitationLayer
          articleRef={articleRef}
          blocks={article.blocks}
          page={pager?.index}
        />
      )}
      {selection && <AddCommentButton selection={selection} onDone={clear} />}
    </>
  );
}

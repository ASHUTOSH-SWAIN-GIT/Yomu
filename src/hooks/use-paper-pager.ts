import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { setArticleProgress } from "@/lib/db";
import { logError } from "@/lib/log";
import {
  pageOfBlock,
  pageOfProgress,
  paperPages,
  progressOfPage,
  type PaperPage,
} from "@/lib/pdf/pages";
import { SHOW_BLOCK } from "@/lib/show-block";
import { useLibraryStore } from "@/stores/library-store";
import type { StoredArticle } from "@/types/library";

export interface Pager {
  pages: PaperPage[];
  index: number;
  page: PaperPage;
  /** Which way the last turn went, for the page's entrance. */
  direction: "next" | "prev" | null;
  go: (index: number, opts?: { keepScroll?: boolean }) => void;
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** A paper is read a page at a time. Opens where the reader left off, saves
 * the page as progress, turns with ← and →, and turns by itself to a block
 * something asks to show (a source link, the outline). */
export function usePaperPager(
  article: StoredArticle,
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): Pager | null {
  const pages = useMemo(
    () => (enabled ? paperPages(article.blocks) : []),
    [enabled, article.blocks],
  );
  const [index, setIndex] = useState(() =>
    pageOfProgress(article.progress, pages.length),
  );
  const [direction, setDirection] = useState<Pager["direction"]>(null);

  const go = useCallback(
    (next: number, opts: { keepScroll?: boolean } = {}) => {
      const target = Math.min(pages.length - 1, Math.max(0, next));
      setIndex((current) => {
        if (target === current) return current;
        setDirection(target > current ? "next" : "prev");
        return target;
      });
      if (!opts.keepScroll) scrollRef.current?.scrollTo({ top: 0 });
      const progress = progressOfPage(target, pages.length);
      useLibraryStore.getState().patch(article.id, { progress });
      setArticleProgress(article.id, progress).catch((err) =>
        logError("saving reading progress failed", err),
      );
    },
    [pages.length, scrollRef, article.id],
  );

  // Only the tab on screen answers keys and requests.
  const active = useCallback(
    () => !!scrollRef.current?.closest('[data-tab-active="true"]'),
    [scrollRef],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (typing(e.target) || !active()) return;
      if (!window.getSelection()?.isCollapsed) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else return;
      e.preventDefault();
    };
    const onShow = (e: Event) => {
      const block = (e as CustomEvent<number>).detail;
      if (!active() || block < 0 || block >= article.blocks.length) return;
      go(pageOfBlock(pages, block), { keepScroll: true });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHOW_BLOCK, onShow);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHOW_BLOCK, onShow);
    };
  }, [enabled, index, go, active, pages, article.blocks.length]);

  if (!enabled || pages.length === 0) return null;
  const at = Math.min(index, pages.length - 1);
  return { pages, index: at, page: pages[at], direction, go };
}

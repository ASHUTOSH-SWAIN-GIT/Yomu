import { useEffect, type RefObject } from "react";
import { setArticleProgress } from "@/lib/db";
import { logError } from "@/lib/log";
import { useLibraryStore } from "@/stores/library-store";

const SAVE_DELAY_MS = 500;
// Ignore changes smaller than this so idle jitter doesn't hit the database.
const MIN_DELTA = 0.01;

/**
 * Restores where the user left off in `article` and saves progress as they
 * scroll. Progress is a 0..1 fraction of the scrollable height, so it stays
 * meaningful if the window is resized or the article is re-fetched.
 */
export function useReadingProgress(
  scrollRef: RefObject<HTMLElement | null>,
  articleId: string,
  initialProgress: number,
) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let restoring = true;
    let saved = initialProgress;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Two frames: let the article lay out before measuring its height.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = initialProgress > 0 ? initialProgress * max : 0;
        restoring = false;
      }),
    );

    function onScroll() {
      if (restoring) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        const progress = max > 0 ? el.scrollTop / max : 1;
        if (Math.abs(progress - saved) < MIN_DELTA) return;
        saved = progress;
        useLibraryStore.getState().patch(articleId, { progress });
        setArticleProgress(articleId, progress).catch((err) =>
          logError("saving reading progress failed", err),
        );
      }, SAVE_DELAY_MS);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
    // `initialProgress` is deliberately read once per article: later
    // changes come from this hook itself and must not re-trigger a restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, articleId]);
}

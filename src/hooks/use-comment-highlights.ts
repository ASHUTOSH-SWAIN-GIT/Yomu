import { useEffect, useRef, type RefObject } from "react";
import { normText, rangeInBlock } from "@/lib/text-ranges";
import { parseImageQuote } from "@/lib/images";
import { useChatStore } from "@/stores/chat-store";
import { useCommentsStore } from "@/stores/comments-store";
import { useIsActiveTab } from "@/stores/tabs";

/** The range some words cover on the page, if they are still there (a
 * re-fetched article that changed shows nothing rather than the wrong
 * words). */
export function rangeOfWords(
  article: HTMLElement,
  w: { blockIndex: number; start: number; end: number; quote: string },
): Range | null {
  // A note on a whole picture has no words to find.
  if (!w.quote) return null;
  const block = article.querySelector<HTMLElement>(
    `[data-block-index="${w.blockIndex}"]`,
  );
  const range = block && rangeInBlock(block, w.start, w.end);
  if (!range || normText(range.toString()) !== normText(w.quote)) return null;
  return range;
}

/**
 * Marks the words that have a comment (and the words a new comment is being
 * written about) with the CSS Custom Highlight API: no change to the page
 * itself, so selecting and React are undisturbed. Silently does nothing
 * where the webview lacks the API.
 */
export function useCommentHighlights(
  articleRef: RefObject<HTMLElement | null>,
) {
  const items = useCommentsStore((s) => s.items);
  const draft = useCommentsStore((s) => s.draft);
  const activeId = useCommentsStore((s) => s.activeId);
  const setActive = useCommentsStore((s) => s.setActive);
  // The highlight registry is shared by the whole window, so only the tab on
  // screen may paint into it.
  const tabActive = useIsActiveTab();
  // The painted words of each saved comment, for finding what is under the
  // pointer.
  const painted = useRef<{ id: string; range: Range }[]>([]);

  useEffect(() => {
    const article = articleRef.current;
    if (
      !tabActive ||
      !article ||
      typeof CSS === "undefined" ||
      !("highlights" in CSS)
    ) {
      return;
    }
    painted.current = [];
    const ranges: Range[] = [];
    const active: Range[] = [];
    for (const c of items) {
      const range = rangeOfWords(article, c);
      if (!range) continue;
      painted.current.push({ id: c.id, range });
      ranges.push(range);
      if (c.id === activeId) active.push(range);
    }
    if (draft) {
      const range = rangeOfWords(article, draft);
      if (range) ranges.push(range);
    }
    CSS.highlights.set("yomu-comment", new Highlight(...ranges));
    // Painted over the rest, so the pointed-at words stand out.
    const glow = new Highlight(...active);
    glow.priority = 1;
    CSS.highlights.set("yomu-comment-active", glow);
    return () => {
      CSS.highlights.delete("yomu-comment");
      CSS.highlights.delete("yomu-comment-active");
    };
  }, [articleRef, items, draft, activeId, tabActive]);

  // Words that were asked about get a thin underline, so the answer card
  // beside them is easy to tie to its words.
  const asked = useChatStore((s) => s.highlights);
  useEffect(() => {
    const article = articleRef.current;
    if (
      !tabActive ||
      !article ||
      typeof CSS === "undefined" ||
      !("highlights" in CSS)
    ) {
      return;
    }
    const ranges = asked.flatMap((h) => {
      if (parseImageQuote(h.text)) return [];
      const range = rangeOfWords(article, {
        blockIndex: h.blockIndex,
        start: h.startOffset,
        end: h.endOffset,
        quote: h.text,
      });
      return range ? [range] : [];
    });
    CSS.highlights.set("yomu-asked", new Highlight(...ranges));
    return () => {
      CSS.highlights.delete("yomu-asked");
    };
  }, [articleRef, asked, tabActive]);

  // Pointing at commented words makes them (and their comment) react.
  useEffect(() => {
    let frame = 0;
    function onMove(e: MouseEvent) {
      if (e.buttons !== 0) return; // selecting, not pointing
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const article = articleRef.current;
        // Over a comment card the card itself decides.
        if ((e.target as Element | null)?.closest?.("[data-comment-card]")) {
          return;
        }
        if (!article || !article.contains(e.target as Node)) {
          return setActive(null);
        }
        const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        const hit = at
          ? painted.current.find(
              (p) =>
                p.range.comparePoint(at.startContainer, at.startOffset) === 0,
            )
          : undefined;
        setActive(hit?.id ?? null);
      });
    }
    document.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMove);
    };
  }, [articleRef, setActive]);
}

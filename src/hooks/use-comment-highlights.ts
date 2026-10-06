import { useEffect, type RefObject } from "react";
import { normText, rangeInBlock } from "@/lib/text-ranges";
import { useCommentsStore } from "@/stores/comments-store";

/** The range some words cover on the page, if they are still there (a
 * re-fetched article that changed shows nothing rather than the wrong
 * words). */
export function rangeOfWords(
  article: HTMLElement,
  w: { blockIndex: number; start: number; end: number; quote: string },
): Range | null {
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

  useEffect(() => {
    const article = articleRef.current;
    if (!article || typeof CSS === "undefined" || !("highlights" in CSS)) {
      return;
    }
    const ranges = [...items, ...(draft ? [draft] : [])]
      .map((w) => rangeOfWords(article, w))
      .filter((r): r is Range => r !== null);
    CSS.highlights.set("yomu-comment", new Highlight(...ranges));
    return () => {
      CSS.highlights.delete("yomu-comment");
    };
  }, [articleRef, items, draft]);
}

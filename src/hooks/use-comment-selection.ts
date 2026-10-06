import { useEffect, useState, type RefObject } from "react";
import { anchorOfRange, type TextAnchor } from "@/lib/text-ranges";

/** A text selection in the article: where it is in the text, and where it
 * is on screen. */
export interface CommentSelection {
  anchor: TextAnchor;
  rect: DOMRect;
}

/**
 * Follows the reader's text selection in the article, for the "Add comment"
 * button. It listens on the whole document, because a drag that starts in
 * the text often ends past the end of a line, outside the article; what
 * counts is that the selection itself starts in the article. A selection
 * running over several paragraphs belongs to the one it starts in.
 */
export function useCommentSelection(
  articleRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
) {
  const [selection, setSelection] = useState<CommentSelection | null>(null);

  useEffect(() => {
    const scroller = scrollRef.current;

    function read() {
      const article = articleRef.current;
      const sel = window.getSelection();
      if (!article || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return setSelection(null);
      }
      const range = sel.getRangeAt(0);
      const anchor = anchorOfRange(range, article);
      setSelection(
        anchor ? { anchor, rect: range.getBoundingClientRect() } : null,
      );
    }

    // Pressing the button itself must not close it.
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-comment-ui]")) return;
      setSelection(null);
    };
    const close = () => setSelection(null);
    // After the browser has settled the selection for this release.
    const onUp = () => setTimeout(read, 0);

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onUp);
    scroller?.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onUp);
      scroller?.removeEventListener("scroll", close);
    };
  }, [articleRef, scrollRef]);

  return { selection, clear: () => setSelection(null) };
}

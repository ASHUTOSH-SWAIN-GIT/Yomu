import { useEffect, type RefObject } from "react";
import type { Highlight } from "@/types/library";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Builds a Range over `[start, end)` characters of a block's text, using
 * the same text-node measure as use-text-selection.ts. */
function rangeInBlock(
  block: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent?.length ?? 0;
    if (!started && start < pos + len) {
      range.setStart(node, start - pos);
      started = true;
    }
    if (started && end <= pos + len) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
  }
  if (!started) return null;
  // Selection ran past the block (multi block selection): clamp to its end.
  range.setEndAfter(block.lastChild ?? block);
  return range;
}

/**
 * Paints previously explained passages with the CSS Custom Highlight API
 * (no DOM changes, so it can't disturb selection or React). A highlight is
 * only painted if the text at its offsets still matches what was saved,
 * so a re-scraped article never shows a wrong highlight. Clicking one calls
 * `onActivate`. Silently does nothing where the webview lacks the API.
 */
export function useHighlights(
  containerRef: RefObject<HTMLElement | null>,
  highlights: Highlight[],
  onActivate: (highlightId: string) => void,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof CSS === "undefined" || !("highlights" in CSS)) {
      return;
    }

    const painted: { id: string; range: Range }[] = [];
    for (const h of highlights) {
      const block = container.querySelector<HTMLElement>(
        `[data-block-index="${h.blockIndex}"]`,
      );
      const range = block && rangeInBlock(block, h.startOffset, h.endOffset);
      if (range && norm(h.text).startsWith(norm(range.toString()))) {
        if (range.toString().trim()) painted.push({ id: h.id, range });
      }
    }
    CSS.highlights.set("yomu", new Highlight(...painted.map((p) => p.range)));

    function onClick(e: MouseEvent) {
      if (!window.getSelection()?.isCollapsed) return; // user is selecting
      const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (!at) return;
      const hit = painted.find(
        (p) => p.range.comparePoint(at.startContainer, at.startOffset) === 0,
      );
      if (hit) onActivate(hit.id);
    }
    container.addEventListener("click", onClick);
    return () => {
      container.removeEventListener("click", onClick);
      CSS.highlights.delete("yomu");
    };
  }, [containerRef, highlights, onActivate]);
}

import { useEffect, useState, type RefObject } from "react";
import type { Selection } from "@/stores/chat-store";

export interface ReaderSelection {
  selection: Selection;
  /** Viewport position to anchor the floating button under. */
  rect: { left: number; bottom: number };
}

function blockOf(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  return el?.closest<HTMLElement>("[data-block-index]") ?? null;
}

/**
 * Tracks the user's text selection inside `containerRef` and maps it to a
 * block index plus character offsets (the format the `highlights` table
 * stores). A selection spanning several blocks is anchored to the block
 * it starts in.
 */
export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
): [ReaderSelection | null, () => void] {
  const [current, setCurrent] = useState<ReaderSelection | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function read() {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !text) {
        setCurrent(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const block = blockOf(range.startContainer);
      if (!block || !container!.contains(block)) {
        setCurrent(null);
        return;
      }

      const before = document.createRange();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);
      const startOffset = before.toString().length;
      const rect = range.getBoundingClientRect();

      setCurrent({
        selection: {
          blockIndex: Number(block.dataset.blockIndex),
          startOffset,
          endOffset: startOffset + text.length,
          text,
        },
        rect: { left: rect.left, bottom: rect.bottom },
      });
    }

    // Read on mouse/keyboard release rather than on every selectionchange,
    // so the button doesn't flicker while the user is still dragging.
    function clearIfCollapsed() {
      if (window.getSelection()?.isCollapsed) setCurrent(null);
    }

    container.addEventListener("mouseup", read);
    container.addEventListener("keyup", read);
    document.addEventListener("selectionchange", clearIfCollapsed);
    return () => {
      container.removeEventListener("mouseup", read);
      container.removeEventListener("keyup", read);
      document.removeEventListener("selectionchange", clearIfCollapsed);
    };
  }, [containerRef]);

  return [current, () => setCurrent(null)];
}

import { useEffect, type RefObject } from "react";
import { useSelectionStore } from "@/stores/selection-store";

function blockOf(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  return el?.closest<HTMLElement>("[data-block-index]") ?? null;
}

/**
 * Publishes the user's text selection inside `containerRef` to the selection
 * store, mapped to a block index plus character offsets (the format the
 * `highlights` table stores). A selection spanning several blocks is
 * anchored to the block it starts in. A new mouse press in the article
 * starts over; the selection is cleared when the article goes away.
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { set } = useSelectionStore.getState();

    function read() {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !text) {
        set(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const block = blockOf(range.startContainer);
      if (!block || !container!.contains(block)) {
        set(null);
        return;
      }

      const before = document.createRange();
      before.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);
      const startOffset = before.toString().length;

      set({
        blockIndex: Number(block.dataset.blockIndex),
        startOffset,
        endOffset: startOffset + text.length,
        text,
      });
    }

    // Read on release rather than on every selectionchange, so the Ask bar
    // doesn't flicker while the user is still dragging.
    const onMouseDown = () => {
      if (useSelectionStore.getState().selection) set(null);
    };

    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mouseup", read);
    container.addEventListener("keyup", read);
    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", read);
      container.removeEventListener("keyup", read);
      set(null);
    };
  }, [containerRef]);
}

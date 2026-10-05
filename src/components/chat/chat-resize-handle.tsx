import { useRef, type RefObject } from "react";
import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_MIN,
  useUiStore,
} from "@/stores/ui-store";

/** The left edge of the chat panel: drag it to change the panel's width,
 * double-click to reset it, or focus it and use the arrow keys. */
export function ChatResizeHandle({
  containerRef,
  onResizing,
}: {
  /** The row holding the article and the panel; the panel can take up to
   * 70% of it. */
  containerRef: RefObject<HTMLElement | null>;
  onResizing: (resizing: boolean) => void;
}) {
  const width = useUiStore((s) => s.chatWidth);
  const setWidth = useUiStore((s) => s.setChatWidth);
  const dragging = useRef(false);

  const clamp = (w: number) => {
    const max = (containerRef.current?.clientWidth ?? 1200) * 0.7;
    return Math.min(Math.max(w, CHAT_WIDTH_MIN), Math.max(max, CHAT_WIDTH_MIN));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chat"
      aria-valuenow={Math.round(width)}
      aria-valuemin={CHAT_WIDTH_MIN}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className="hover:bg-foreground/25 focus-visible:bg-foreground/25 absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none transition-colors select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onResizing(true);
      }}
      onPointerMove={(e) => {
        if (!dragging.current || !containerRef.current) return;
        const right = containerRef.current.getBoundingClientRect().right;
        setWidth(clamp(right - e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onResizing(false);
        setWidth(useUiStore.getState().chatWidth, true);
      }}
      onDoubleClick={() => setWidth(CHAT_WIDTH_DEFAULT, true)}
      onKeyDown={(e) => {
        const step =
          e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
        if (!step) return;
        e.preventDefault();
        setWidth(clamp(width + step), true);
      }}
    />
  );
}

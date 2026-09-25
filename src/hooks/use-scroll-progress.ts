import { useEffect, useState, type RefObject } from "react";

/** Live 0..1 scroll position of `ref`, for the progress line. Separate from
 * use-reading-progress, which saves a debounced value to the database. */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  resetKey: string | null,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, resetKey]);

  return progress;
}

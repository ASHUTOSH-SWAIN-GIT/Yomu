import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { Block } from "@/types/article";

/** How far below the top of the page a heading counts as "current". */
const OFFSET = 120;

/** A strip of dashes on the right edge, one per heading. Clicking opens the
 * list of headings; picking one scrolls to it. */
export function Outline({
  blocks,
  scrollRef,
}: {
  blocks: Block[];
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const headings = useMemo(
    () =>
      blocks.flatMap((b, index) =>
        b.type === "heading" ? [{ index, text: b.text, level: b.level }] : [],
      ),
    [blocks],
  );
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const blockEl = (index: number) =>
    scrollRef.current?.querySelector<HTMLElement>(
      `[data-block-index="${index}"]`,
    );

  // The current heading is the last one that has reached the top.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => {
      const top = scroller.getBoundingClientRect().top + OFFSET;
      let found = 0;
      headings.forEach((h, i) => {
        const el = blockEl(h.index);
        if (el && el.getBoundingClientRect().top <= top) found = i;
      });
      setCurrent(found);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headings, scrollRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A short delay on leaving lets the pointer cross the gap to the list.
  const show = (on: boolean) => {
    clearTimeout(closeTimer.current);
    if (on) setOpen(true);
    else closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  if (headings.length < 2) return null;

  const go = (index: number) => {
    blockEl(index)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => show(true)}
      onMouseLeave={() => show(false)}
      className="absolute top-1/2 right-3 z-20 -translate-y-1/2 font-sans"
    >
      <button
        type="button"
        aria-label="Outline"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => show(true)}
        className="flex max-h-[70vh] flex-col items-end gap-2 overflow-hidden px-2 py-2"
      >
        {headings.map((h, i) => (
          <i
            key={h.index}
            className={cn(
              "h-0.5 rounded-full transition-all",
              i === current
                ? "bg-foreground w-4"
                : "bg-muted-foreground/50 w-3.5",
            )}
          />
        ))}
      </button>
      {
        <div
          inert={!open}
          className={cn(
            "bg-popover border-border absolute top-1/2 right-full mr-1 max-h-[70vh] w-72 origin-right -translate-y-1/2 overflow-y-auto rounded-xl border p-2 transition-[opacity,translate,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            open
              ? "translate-x-0 scale-100 opacity-100 shadow-[var(--shadow-float)]"
              : "pointer-events-none translate-x-2 scale-95 opacity-0",
          )}
        >
          {headings.map((h, i) => (
            <button
              key={h.index}
              type="button"
              onClick={() => go(h.index)}
              style={{ paddingLeft: 12 + (h.level - minLevel) * 12 }}
              className={cn(
                "hover:bg-accent block w-full rounded-md py-1.5 pr-3 text-left text-[0.8125rem] leading-snug",
                i === current
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {h.text}
            </button>
          ))}
        </div>
      }
    </div>
  );
}

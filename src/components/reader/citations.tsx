import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { findCitations, referencesOf } from "@/lib/citations";
import { rangeInBlock } from "@/lib/text-ranges";
import type { Block } from "@/types/article";

const HIGHLIGHT = "yomu-cite";
/** How long the pointer rests on a citation before its card opens. */
const HOVER_MS = 200;
/** Text citations are looked for in. */
const SEARCHED = new Set(["paragraph", "list", "quote"]);

interface Painted {
  range: Range;
  numbers: string[];
}

/**
 * In a paper, a numbered citation ("[12]") shows the reference it points to
 * when pointed at, so the reader does not have to turn to the end. Drawn
 * with the CSS Custom Highlight API, like the glossary, so the text itself
 * is not changed (and comments and selection are unaffected).
 */
export function CitationLayer({
  articleRef,
  blocks,
  page,
}: {
  articleRef: RefObject<HTMLElement | null>;
  blocks: Block[];
  /** The page of the paper on screen; its citations are found again. */
  page?: number;
}) {
  const refs = useMemo(() => referencesOf(blocks), [blocks]);
  const painted = useRef<Painted[]>([]);
  const [open, setOpen] = useState<{
    numbers: string[];
    rect: DOMRect;
  } | null>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || refs.size === 0 || !("highlights" in CSS)) return;
    const found: Painted[] = [];
    blocks.forEach((block, index) => {
      if (!SEARCHED.has(block.type)) return;
      const el = article.querySelector<HTMLElement>(
        `[data-block-index="${index}"]`,
      );
      if (!el) return;
      for (const m of findCitations(el.textContent ?? "", refs)) {
        const range = rangeInBlock(el, m.start, m.end);
        if (range) found.push({ range, numbers: m.numbers });
      }
    });
    painted.current = found;
    if (found.length > 0) {
      CSS.highlights.set(
        HIGHLIGHT,
        new Highlight(...found.map((f) => f.range)),
      );
    }
    return () => {
      CSS.highlights.delete(HIGHLIGHT);
      painted.current = [];
    };
  }, [articleRef, blocks, refs, page]);

  useEffect(() => {
    if (refs.size === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onMove(e: MouseEvent) {
      if (e.buttons !== 0) return; // selecting, not pointing
      clearTimeout(timer);
      const article = articleRef.current;
      const at =
        article?.contains(e.target as Node) && painted.current.length > 0
          ? document.caretRangeFromPoint?.(e.clientX, e.clientY)
          : null;
      const hit = at
        ? painted.current.find(
            (p) =>
              p.range.comparePoint(at.startContainer, at.startOffset) === 0,
          )
        : undefined;
      if (!hit) return setOpen(null);
      timer = setTimeout(
        () =>
          setOpen({
            numbers: hit.numbers,
            rect: hit.range.getBoundingClientRect(),
          }),
        HOVER_MS,
      );
    }
    document.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousemove", onMove);
    };
  }, [articleRef, refs]);

  // Scrolling closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  if (!open) return null;
  return createPortal(<ReferenceCard {...open} refs={refs} />, document.body);
}

/** The cited references, above the citation (or under it near the top). */
function ReferenceCard({
  numbers,
  rect,
  refs,
}: {
  numbers: string[];
  rect: DOMRect;
  refs: Map<string, string>;
}) {
  const above = rect.top > 200;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, 190),
    window.innerWidth - 190,
  );
  return (
    <div
      role="tooltip"
      className="pop-in bg-popover text-popover-foreground text-ui pointer-events-none fixed z-50 flex max-h-72 w-[24rem] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-hidden rounded-xl p-3.5 font-sans leading-relaxed shadow-[var(--shadow-float)]"
      style={{
        left,
        top: above ? rect.top - 8 : rect.bottom + 8,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
    >
      {numbers.slice(0, 5).map((n) => (
        <p key={n} className="flex gap-2">
          <span className="text-muted-foreground shrink-0 tabular-nums">
            [{n}]
          </span>
          <span className="line-clamp-4">{refs.get(n)}</span>
        </p>
      ))}
      {numbers.length > 5 && (
        <p className="text-muted-foreground text-meta">
          and {numbers.length - 5} more
        </p>
      )}
    </div>
  );
}

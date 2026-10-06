import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@/components/chat/markdown";
import { gist, termFinder, type GlossaryTerm } from "@/lib/glossary";
import { rangeInBlock } from "@/lib/text-ranges";
import { useChatStore } from "@/stores/chat-store";
import { useGlossaryStore } from "@/stores/glossary-store";
import type { Block } from "@/types/article";

const HIGHLIGHT = "yomu-term";
/** How long the pointer rests on a term before its card opens. */
const HOVER_MS = 250;

/** Text the glossary looks in: running text, not headings or code. */
const SEARCHED = new Set(["paragraph", "list", "quote"]);

interface Painted {
  range: Range;
  entry: GlossaryTerm;
}

/**
 * Terms the agent has explained before get a dotted underline wherever they
 * appear in the article, and pointing at one shows the answer it gave then.
 * Drawn with the CSS Custom Highlight API (like comments), so the article
 * itself is not changed. Does nothing where the webview lacks it.
 */
export function GlossaryLayer({
  articleRef,
  articleId,
  blocks,
}: {
  articleRef: RefObject<HTMLElement | null>;
  articleId: string;
  blocks: Block[];
}) {
  const terms = useGlossaryStore((s) => s.terms);
  const load = useGlossaryStore((s) => s.load);
  const streaming = useChatStore((s) => s.streaming);
  const painted = useRef<Painted[]>([]);
  const [open, setOpen] = useState<{
    entry: GlossaryTerm;
    rect: DOMRect;
  } | null>(null);

  // Read at the start, and again when an answer finishes: the term just
  // explained joins the glossary.
  useEffect(() => {
    if (!streaming) void load();
  }, [streaming, load]);

  const find = useMemo(() => termFinder(terms), [terms]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !("highlights" in CSS)) return;
    const found: Painted[] = [];
    blocks.forEach((block, index) => {
      if (!SEARCHED.has(block.type)) return;
      const el = article.querySelector<HTMLElement>(
        `[data-block-index="${index}"]`,
      );
      if (!el) return;
      for (const m of find(el.textContent ?? "")) {
        const range = rangeInBlock(el, m.start, m.end);
        if (range) found.push({ range, entry: m.entry });
      }
    });
    painted.current = found;
    if (found.length > 0) {
      CSS.highlights.set(
        HIGHLIGHT,
        new Highlight(...found.map((f) => f.range)),
      );
    } else CSS.highlights.delete(HIGHLIGHT);
    return () => {
      CSS.highlights.delete(HIGHLIGHT);
      painted.current = [];
    };
  }, [articleRef, articleId, blocks, find]);

  // Pointing at a term opens its card after a short rest, and moving off it
  // closes the card.
  useEffect(() => {
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
            entry: hit.entry,
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
  }, [articleRef]);

  // Scrolling or leaving the article closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  if (!open) return null;
  return createPortal(<TermCard {...open} />, document.body);
}

/** The earlier answer, above the term (or under it when there is no room). */
function TermCard({ entry, rect }: { entry: GlossaryTerm; rect: DOMRect }) {
  const above = rect.top > 220;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, 190),
    window.innerWidth - 190,
  );
  return (
    <div
      role="tooltip"
      className="pop-in bg-popover text-popover-foreground pointer-events-none fixed z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl p-3.5 font-sans text-[0.8125rem] shadow-[var(--shadow-float)]"
      style={{
        left,
        top: above ? rect.top - 8 : rect.bottom + 8,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
    >
      <p className="font-semibold">{entry.term}</p>
      <div className="mt-1.5 max-h-48 overflow-hidden leading-relaxed">
        <Markdown>{gist(entry.answer)}</Markdown>
      </div>
      {entry.articleTitle && (
        <p className="text-muted-foreground mt-2 truncate text-[0.75rem]">
          Explained in “{entry.articleTitle}”
        </p>
      )}
    </div>
  );
}

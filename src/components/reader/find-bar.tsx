import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { domMatches, findMatches, firstFrom, OPEN_FIND } from "@/lib/find";
import { requestBlock } from "@/lib/show-block";
import type { Block } from "@/types/article";

const ALL = "yomu-find";
const CURRENT = "yomu-find-active";
// The webview may lack the Custom Highlight API; then matches are counted
// and scrolled to, just not painted.
const painted = typeof CSS !== "undefined" && "highlights" in CSS;

/** Find in the article (Cmd/Ctrl+F): type to see every match, Enter and
 * Shift+Enter step through them, Escape closes. The count covers the whole
 * article; on a paper, stepping to a match on another page turns to it. */
export function FindBar({
  articleRef,
  scrollRef,
  blocks,
  page,
}: {
  articleRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  blocks: Block[];
  /** The paper's page on screen, so matches are painted again when it turns. */
  page?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => (open ? findMatches(blocks, query) : []),
    [open, blocks, query],
  );
  const at = matches.length > 0 ? Math.min(current, matches.length - 1) : -1;

  // Only the tab on screen opens; words selected on the page start the
  // search, as in a browser.
  useEffect(() => {
    const onOpen = () => {
      const root = articleRef.current;
      if (!root?.closest('[data-tab-active="true"]')) return;
      const picked = window.getSelection()?.toString().trim();
      if (picked && !picked.includes("\n")) {
        setQuery(picked);
        setCurrent(startAt(picked, blocks, root, scrollRef.current));
      }
      setOpen(true);
      requestAnimationFrame(() => input.current?.select());
    };
    window.addEventListener(OPEN_FIND, onOpen);
    return () => window.removeEventListener(OPEN_FIND, onOpen);
  }, [articleRef, scrollRef, blocks]);

  // Paint every match on the page, and the current one more strongly, then
  // bring the current one into view. A paper turns to its page first, which
  // changes `page` and runs this again.
  useEffect(() => {
    const clear = () => {
      if (!painted) return;
      CSS.highlights.delete(ALL);
      CSS.highlights.delete(CURRENT);
    };
    const root = articleRef.current;
    if (!open || !root || at < 0) return clear;
    const target = matches[at];
    const el = root.querySelector(`[data-block-index="${target.block}"]`);
    if (!el) {
      requestBlock(target.block);
      return clear;
    }
    const all: Range[] = [];
    let currentRange: Range | null = null;
    for (const block of new Set(matches.map((m) => m.block))) {
      const blockEl = root.querySelector(`[data-block-index="${block}"]`);
      if (!blockEl) continue;
      const ranges = domMatches(blockEl, query);
      all.push(...ranges);
      if (block === target.block)
        currentRange = ranges[Math.min(target.nth, ranges.length - 1)] ?? null;
    }
    if (painted) {
      CSS.highlights.set(ALL, new Highlight(...all));
      if (currentRange)
        CSS.highlights.set(CURRENT, new Highlight(currentRange));
      else CSS.highlights.delete(CURRENT);
    }
    reveal(el as HTMLElement, currentRange, scrollRef.current);
    return clear;
  }, [open, matches, at, query, page, articleRef, scrollRef]);

  function search(next: string) {
    setQuery(next);
    setCurrent(startAt(next, blocks, articleRef.current, scrollRef.current));
  }

  function step(by: number) {
    if (matches.length === 0) return;
    setCurrent((at + by + matches.length) % matches.length);
  }

  function close() {
    setOpen(false);
  }

  if (!open) return null;
  return (
    // Sticks to the top of the page as you scroll, taking no room in it.
    <div className="sticky top-3 z-30 flex h-0 justify-end px-4 font-sans">
      <div
        role="search"
        className="bg-popover text-ui flex h-9 items-center gap-1 rounded-lg border pr-1 pl-3 shadow-[var(--shadow-float)] motion-safe:animate-[yomu-pop_160ms_ease-out]"
      >
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <input
          ref={input}
          autoFocus
          // A search term is not prose: no autocorrect bubble from macOS.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          placeholder="Find in article"
          aria-label="Find in article"
          className="placeholder:text-muted-foreground w-48 min-w-0 bg-transparent outline-none"
        />
        <span
          aria-live="polite"
          className="text-muted-foreground text-caption w-20 shrink-0 text-right tabular-nums"
        >
          {query && (at >= 0 ? `${at + 1} of ${matches.length}` : "No matches")}
        </span>
        <IconButton
          label="Previous match"
          size="sm"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          <ChevronUp aria-hidden />
        </IconButton>
        <IconButton
          label="Next match"
          size="sm"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          <ChevronDown aria-hidden />
        </IconButton>
        <IconButton label="Close" size="sm" onClick={close}>
          <X aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

/** A new search starts at the first match from where you are reading. */
function startAt(
  query: string,
  blocks: Block[],
  root: HTMLElement | null,
  scroller: HTMLElement | null,
): number {
  const from = root && scroller ? blockAtTop(root, scroller) : 0;
  return firstFrom(findMatches(blocks, query), from);
}

/** The index of the first block still on screen at the top. */
function blockAtTop(root: HTMLElement, scroller: HTMLElement): number {
  const top = scroller.getBoundingClientRect().top;
  for (const el of root.querySelectorAll<HTMLElement>("[data-block-index]")) {
    if (el.getBoundingClientRect().bottom > top)
      return Number(el.dataset.blockIndex);
  }
  return 0;
}

/** Scrolls the match to the middle of the page, unless it is already in
 * view. Blocks far off screen are not laid out yet (`content-visibility`),
 * so the block is brought near first and the match placed once it is. */
function reveal(
  block: HTMLElement,
  range: Range | null,
  scroller: HTMLElement | null,
) {
  if (!scroller) return;
  const view = scroller.getBoundingClientRect();
  const box = (range ?? block).getBoundingClientRect();
  if (box.top >= view.top + 48 && box.bottom <= view.bottom - 48) return;
  block.scrollIntoView({ block: "center" });
  if (!range) return;
  requestAnimationFrame(() => {
    const now = range.getBoundingClientRect();
    const mid = scroller.getBoundingClientRect();
    scroller.scrollTop += now.top - (mid.top + mid.height / 2);
  });
}

/** Collapses whitespace, for comparing saved text with the page. */
export const normText = (s: string) => s.replace(/\s+/g, " ").trim();

/** The block element (paragraph, list, ...) a node is inside. */
export function blockOf(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  return el?.closest<HTMLElement>("[data-block-index]") ?? null;
}

/** Builds a Range over characters `[start, end)` of a block's text. A range
 * running past the block is clamped to its end. */
export function rangeInBlock(
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
  range.setEndAfter(block.lastChild ?? block);
  return range;
}

/** Where a selection sits: its block and character offsets in it. A
 * selection spanning blocks is cut at the end of the block it starts in. */
export interface TextAnchor {
  blockIndex: number;
  start: number;
  end: number;
  quote: string;
}

export function anchorOfRange(
  range: Range,
  container: HTMLElement,
): TextAnchor | null {
  const block = blockOf(range.startContainer);
  if (!block || !container.contains(block)) return null;
  const before = document.createRange();
  before.selectNodeContents(block);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;

  const inBlock = document.createRange();
  inBlock.selectNodeContents(block);
  // Keep the end inside this block when the selection runs on.
  if (block.contains(range.endContainer)) {
    inBlock.setEnd(range.endContainer, range.endOffset);
  }
  const end = inBlock.toString().length;
  const quote = block.textContent?.slice(start, end) ?? "";
  if (!quote.trim() || end <= start) return null;
  return { blockIndex: Number(block.dataset.blockIndex), start, end, quote };
}

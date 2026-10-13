import type { Block, Span } from "@/types/article";

/** Asks the reader on screen to open its find bar (Cmd/Ctrl+F). */
export const OPEN_FIND = "yomu-open-find";

/** One match: the block it is in, and which match it is within that block. */
export interface FindMatch {
  block: number;
  nth: number;
}

const words = (spans: Span[]) =>
  spans.map((s) => (s.math ? "" : s.text)).join("");

/** A block's words as the reader shows them, without the Markdown marks
 * `blockText` adds for the agent. Formulas and pictures are left out, since
 * what is drawn there is not the text behind it; `domMatches` skips the same
 * things on the page, so the two count alike. */
export function shownText(block: Block): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
    case "quote":
      return words(block.spans);
    case "code":
      return block.content;
    case "list":
      return block.items.map((item) => words(item.spans)).join("");
    case "table":
      return [block.header, ...block.rows].flat().join("");
    case "math":
    case "image":
      return "";
  }
}

/** Where `query` starts in `text`, ignoring case, without overlaps. */
export function occurrences(text: string, query: string): number[] {
  if (!query) return [];
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  const found: number[] = [];
  for (
    let at = hay.indexOf(needle);
    at !== -1;
    at = hay.indexOf(needle, at + needle.length)
  )
    found.push(at);
  return found;
}

/** Every match of `query` in the article, in reading order. Counted from the
 * article itself, not the page, so a paper's other pages count too. */
export function findMatches(blocks: Block[], query: string): FindMatch[] {
  const matches: FindMatch[] = [];
  blocks.forEach((block, index) => {
    const count = occurrences(shownText(block), query).length;
    for (let nth = 0; nth < count; nth++) matches.push({ block: index, nth });
  });
  return matches;
}

/** The match to start on: the first one at or after `fromBlock` (where the
 * reader is), or the first of all when there is none further on. */
export function firstFrom(matches: FindMatch[], fromBlock: number): number {
  const index = matches.findIndex((m) => m.block >= fromBlock);
  return index === -1 ? 0 : index;
}

/** Skipped on the page, as `shownText` skips them: typeset formulas,
 * pictures, and buttons such as a code block's Copy. */
const SKIP = ".katex, figure, button";

/** The matches of `query` in one block on the page, as ranges to paint. The
 * text is read across elements, so a word split by code colouring or a link
 * is still found. */
export function domMatches(el: Element, query: string): Range[] {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).data;
  }
  // The text node holding `offset` (the start of a match, or for its end the
  // node it finishes in), and the offset inside that node.
  const locate = (offset: number, end: boolean): [Text, number] => {
    let i = 0;
    while (
      i < nodes.length - 1 &&
      (end ? starts[i + 1] < offset : starts[i + 1] <= offset)
    )
      i++;
    return [nodes[i], offset - starts[i]];
  };
  return occurrences(text, query).map((start) => {
    const range = document.createRange();
    range.setStart(...locate(start, false));
    range.setEnd(...locate(start + query.length, true));
    return range;
  });
}

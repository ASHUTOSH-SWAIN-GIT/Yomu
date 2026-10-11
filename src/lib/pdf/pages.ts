import { blockText } from "@/lib/article-text";
import type { Block } from "@/types/article";

/** One page of a paper in the paged reader: blocks `[start, end)`. */
export interface PaperPage {
  /** The PDF's page number (or a running number when it is not known). */
  number: number;
  start: number;
  end: number;
}

/** How much text makes a page when the PDF's own pages are not known (a
 * paper imported before page numbers were kept). */
const CHARS_PER_PAGE = 3500;

/** Splits a paper's blocks into pages: its own PDF pages when the blocks
 * say which page they are on, otherwise runs of about a page of text. */
export function paperPages(blocks: Block[]): PaperPage[] {
  if (blocks.length === 0) return [];
  const pages: PaperPage[] = [];

  if (blocks.some((b) => b.page !== undefined)) {
    let current = blocks[0].page ?? 1;
    let start = 0;
    blocks.forEach((b, i) => {
      if (b.page !== undefined && b.page !== current && i > start) {
        pages.push({ number: current, start, end: i });
        start = i;
      }
      if (b.page !== undefined) current = b.page;
    });
    pages.push({ number: current, start, end: blocks.length });
    return pages;
  }

  let start = 0;
  let chars = 0;
  blocks.forEach((b, i) => {
    // Break before a heading once a page is mostly full, else when full.
    const full =
      chars >= CHARS_PER_PAGE ||
      (b.type === "heading" && chars >= CHARS_PER_PAGE * 0.6);
    if (full && i > start) {
      pages.push({ number: pages.length + 1, start, end: i });
      start = i;
      chars = 0;
    }
    chars += blockText(b).length;
  });
  pages.push({ number: pages.length + 1, start, end: blocks.length });
  return pages;
}

/** Which page (its position in `pages`) holds a block. */
export function pageOfBlock(pages: PaperPage[], block: number): number {
  const at = pages.findIndex((p) => block >= p.start && block < p.end);
  return at < 0 ? 0 : at;
}

/** Reading progress for being on page `index` of `count`: the last page
 * counts as finished. */
export const progressOfPage = (index: number, count: number) =>
  count <= 1 ? 1 : (index + 1) / count;

/** The page to open on, from saved progress. */
export function pageOfProgress(progress: number, count: number): number {
  if (count <= 1 || !(progress > 0)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(progress * count) - 1));
}

/** Where the reader is in a paper: the page on screen and its text. */
export interface ReadingSpot {
  /** The PDF's page number. */
  page: number;
  /** Its position among the paper's pages, from 0, and how many there are. */
  index: number;
  count: number;
  text: string;
}

export function readingSpot(
  blocks: Block[],
  progress: number,
): ReadingSpot | undefined {
  const pages = paperPages(blocks);
  if (pages.length === 0) return undefined;
  const index = pageOfProgress(progress, pages.length);
  const p = pages[index];
  return {
    page: p.number,
    index,
    count: pages.length,
    text: blocks
      .slice(p.start, p.end)
      .map(blockText)
      .filter(Boolean)
      .join("\n\n"),
  };
}

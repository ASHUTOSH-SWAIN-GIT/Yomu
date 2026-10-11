import {
  bodySize,
  notesToBlocks,
  splitFootnotes,
  toBlocks,
  type PlacedBlock,
} from "@/lib/pdf/blocks";
import { dropRunning } from "@/lib/pdf/clean";
import { buildLines, type Line } from "@/lib/pdf/lines";
import { FIGURE_SCHEME } from "@/lib/images";
import { readingOrder } from "@/lib/pdf/layout";
import { findRegions, placeRegions, type Region } from "@/lib/pdf/regions";
import { NoTextError, type PdfInfo, type PdfPage } from "@/lib/pdf/types";
import type { Block } from "@/types/article";

export interface ParsedPdf {
  title: string;
  author: string | null;
  publishedAt: number | null;
  blocks: Block[];
  /** The PDF page each block starts on, same order as `blocks`. */
  pages: number[];
  pageCount: number;
  /** The figures, tables and equations to cut from the pages, each shown
   * by an image block whose `src` is `figureSrc(region)`. */
  regions: Region[];
}

/** Where a cut-out figure's picture is found: a name Yomu gives it, kept
 * in the image cache under the paper's id (see render.ts and
 * src-tauri/src/imgcache.rs). */
export function figureSrc(sha: string, region: Region): string {
  return `${FIGURE_SCHEME}${sha}/${region.id}.png`;
}

const UNSURE_TITLE =
  /^(microsoft word|untitled|document\d*|slide \d+)|\.(docx?|tex|pdf|indd)$/i;
const AFFILIATION =
  /@|\d|universit|institut|laborator|department|school of|college|google|microsoft|meta\b|openai|deepmind|research|corporation|inc\.|ltd/i;

/** The big lines at the top of the first page, and the author lines under
 * them. They become the article's title and author, so they are taken out
 * of the body. */
function titleOf(first: Line[], body: number) {
  const top = first.filter((l) => l.rel < 0.45 && !l.mono);
  const max = Math.max(0, ...top.map((l) => l.size));
  if (max < body * 1.2) return null;

  const start = first.findIndex((l) => l.size >= max * 0.92 && l.rel < 0.45);
  if (start < 0) return null;
  let end = start;
  while (
    end + 1 < first.length &&
    end - start < 4 &&
    first[end + 1].size >= max * 0.92 &&
    first[end + 1].y - first[end].y < max * 2
  ) {
    end++;
  }
  const title = first
    .slice(start, end + 1)
    .map((l) => l.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Everything between the title and the abstract is the author block.
  const abstractAt = first.findIndex(
    (l, i) => i > end && /^abstract\b/i.test(l.text) && l.size < max * 0.92,
  );
  const blockEnd = abstractAt > 0 && abstractAt - end <= 40 ? abstractAt : -1;

  // Plain lines of names (no marks, emails or affiliations) are the authors;
  // an author grid, read column by column, is not worth quoting.
  const authors: string[] = [];
  for (
    let next = end + 1;
    next < (blockEnd > 0 ? blockEnd : first.length) && authors.length < 3;
    next++
  ) {
    const l = first[next];
    if (
      l.size >= max * 0.92 ||
      l.rel > 0.5 ||
      AFFILIATION.test(l.text) ||
      /[∗*†‡§¶]/.test(l.text) ||
      l.text.length > 140
    ) {
      authors.length = 0;
      break;
    }
    authors.push(l.text);
  }
  const next = blockEnd > 0 ? blockEnd : end + 1 + authors.length;
  return {
    title,
    author: authors.length > 0 ? authors.join(", ") : null,
    // Lines 0..next are used up (anything above the title is a stray).
    consumed: new Set(first.slice(0, next)),
  };
}

export function parsePages(
  pages: PdfPage[],
  info: PdfInfo,
  fileName: string,
  /** The paper's id, for its figures' names. */
  sha = "paper",
): ParsedPdf {
  const chars = pages.reduce(
    (n, p) => n + p.items.reduce((m, i) => m + i.str.trim().length, 0),
    0,
  );
  if (chars < 200) throw new NoTextError();

  const ordered = pages.map((p) => readingOrder(buildLines(p), p.width));
  const cleaned = dropRunning(ordered);
  const all = cleaned.flat();
  const body = bodySize(all);

  const found = titleOf(cleaned[0] ?? [], body);
  const kept = found
    ? cleaned.map((page) => page.filter((l) => !found.consumed.has(l)))
    : cleaned;

  // Figures, tables and equations come out of the text, each leaving a
  // stand-in where it was.
  const regions: Region[] = [];
  const lines = kept.flatMap((page, i) => {
    const p = pages[i];
    const found = findRegions(page, p.graphics ?? [], body, p.number, p);
    regions.push(...found);
    return placeRegions(page, found);
  });
  const { body: text, notes } = splitFootnotes(lines, body);
  // Each page's footnotes go after its text, where a reader turning pages
  // expects them.
  const placed: PlacedBlock[] = [];
  const pending = notesToBlocks(notes);
  const regionBlock = (r: Region): Block => ({
    type: "image",
    src: figureSrc(sha, r),
    // Shown under the picture: the caption. An equation's text is kept for
    // search and the agent, and not shown.
    alt: r.caption ?? (r.kind === "equation" ? r.text || null : null),
    // As wide as on the page, measured in the body text's size, so it
    // matches the reader's text size.
    width: Math.round(((r.x2 - r.x) / body) * 100) / 100,
  });
  for (const p of toBlocks(text, body, regionBlock)) {
    while (pending.length > 0 && pending[0].page < p.page) {
      placed.push(pending.shift()!);
    }
    placed.push(p);
  }
  placed.push(...pending);

  const fromInfo =
    info.title &&
    info.title.trim().length >= 8 &&
    !UNSURE_TITLE.test(info.title.trim())
      ? info.title.trim()
      : null;
  const fromName = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const author = found?.author ?? (info.author?.trim() || null);

  return {
    title: found?.title || fromInfo || fromName || "Untitled PDF",
    author,
    publishedAt: info.created ?? null,
    blocks: placed.map((p) => ({ ...p.block, page: p.page })),
    pages: placed.map((p) => p.page),
    pageCount: pages.length,
    regions,
  };
}

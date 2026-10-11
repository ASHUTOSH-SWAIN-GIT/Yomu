import type { PdfPage } from "@/lib/pdf/types";

/** A stretch of a line in one style. */
export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

export interface Line {
  page: number;
  /** Left and right edge. */
  x: number;
  x2: number;
  /** Baseline, from the top of the page. */
  y: number;
  /** `y` as a share of the page height, 0 at the top. */
  rel: number;
  size: number;
  runs: Run[];
  text: string;
  bold: boolean;
  mono: boolean;
  /** 0 across the page, 1 left column, 2 right column (see layout.ts). */
  col: 0 | 1 | 2;
  /** Right edge of the column this line is in. */
  colRight: number;
}

/** Bold, italic and monospace, from a font's name. */
export function fontStyle(name: string) {
  // Without the subset prefix (`ABCDEF+`).
  const n = name.replace(/^[A-Z]{6}\+/, "");
  return {
    bold: /bold|black|heavy|demi|[-_,]medi\b|(^|[-_,])cmbx|(^|[-_,])cmb|[-_]bd\b/i.test(
      n,
    ),
    italic: /ital|obli|(^|[-_,])cmti|(^|[-_,])cmsl|[-_]it\b/i.test(n),
    mono: /mono|courier|consolas|menlo|typewriter|cmtt|sftt|inconsolata/i.test(
      n,
    ),
  };
}

const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  " ": " ",
};

export function cleanText(s: string): string {
  return s.replace(/[\uFB00-\uFB04\u00A0]/g, (c) => LIGATURES[c] ?? c);
}

/** Joins a page's text pieces into lines. Pieces on one baseline are one
 * line, unless there is a gap wide enough to be the space between two
 * columns, in which case they are two. */
export function buildLines(page: PdfPage): Line[] {
  const items = page.items
    .filter((i) => i.str !== "" && Number.isFinite(i.x) && Number.isFinite(i.y))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Pieces sharing a baseline (a raised number counts as sharing it).
  const rows: (typeof items)[] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    const tol = Math.max(1.5, 0.45 * Math.min(item.size, row?.[0]?.size ?? 99));
    if (row && Math.abs(item.y - row[0].y) <= tol) row.push(item);
    else rows.push([item]);
  }

  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let segment: typeof row = [];
    const flush = () => {
      const line = lineOf(segment, page);
      if (line) lines.push(line);
      segment = [];
    };
    for (const item of row) {
      const last = segment[segment.length - 1];
      if (last && item.x - (last.x + last.width) > 1.2 * Math.max(item.size, 6))
        flush();
      segment.push(item);
    }
    flush();
  }
  return lines;
}

function lineOf(items: PdfPage["items"], page: PdfPage): Line | null {
  const runs: Run[] = [];
  let prevEnd = -Infinity;
  let size = 0;
  let baseline = 0;
  let weight = 0;
  for (const item of items) {
    const text = cleanText(item.str);
    if (text.trim() === "") {
      // An explicit space.
      if (runs.length > 0) runs[runs.length - 1].text += " ";
      prevEnd = item.x + item.width;
      continue;
    }
    const style = fontStyle(item.font);
    const gap = item.x - prevEnd;
    const last = runs[runs.length - 1];
    const needsSpace =
      last !== undefined &&
      gap > 0.12 * item.size &&
      !last.text.endsWith(" ") &&
      !text.startsWith(" ");
    if (last && last.bold === style.bold && last.italic === style.italic) {
      last.text += (needsSpace ? " " : "") + text;
    } else {
      if (needsSpace) last.text += " ";
      runs.push({ text, ...style });
    }
    prevEnd = item.x + item.width;
    // The size of the line is the size most of its text has.
    const w = text.length;
    if (w > weight || (w === weight && item.size > size)) {
      weight = w;
      size = item.size;
      baseline = item.y;
    }
  }
  const text = runs
    .map((r) => r.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const first = items.find((i) => i.str.trim() !== "") ?? items[0];
  const lastItem = [...items].reverse().find((i) => i.str.trim() !== "")!;
  return {
    page: page.number,
    x: first.x,
    x2: lastItem.x + lastItem.width,
    y: baseline,
    rel: baseline / Math.max(1, page.height),
    size: size || 10,
    runs,
    text,
    bold: runs.every((r) => r.bold || r.text.trim() === ""),
    mono: runs.every((r) => r.mono || r.text.trim() === ""),
    col: 0,
    colRight: lastItem.x + lastItem.width,
  };
}

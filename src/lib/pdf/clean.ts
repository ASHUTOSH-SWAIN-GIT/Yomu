import type { Line } from "@/lib/pdf/lines";

const EDGE = 0.09;

function key(l: Line): string {
  return l.text.replace(/\d+/g, "#").toLowerCase();
}

/** Drops what repeats on every page: running heads, footers and page
 * numbers. Returns the pages' lines without them. */
export function dropRunning(pages: Line[][]): Line[][] {
  const seen = new Map<string, Set<number>>();
  const inEdge = (l: Line) => l.rel < EDGE || l.rel > 1 - EDGE;
  pages.forEach((lines, p) => {
    for (const l of lines) {
      if (!inEdge(l)) continue;
      const k = `${l.rel < 0.5 ? "top" : "bottom"}|${key(l)}`;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(p);
    }
  });
  const needed = Math.max(3, Math.ceil(pages.length * 0.4));
  const pageNumber = /^(page\s+)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;
  return pages.map((lines) =>
    lines.filter((l) => {
      if (!inEdge(l)) return true;
      if (pageNumber.test(l.text)) return false;
      const k = `${l.rel < 0.5 ? "top" : "bottom"}|${key(l)}`;
      return (seen.get(k)?.size ?? 0) < needed;
    }),
  );
}

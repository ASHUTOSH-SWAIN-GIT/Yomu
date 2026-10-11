import type { Line } from "@/lib/pdf/lines";

/** Puts a page's lines in reading order. On a two-column page that is the
 * left column, then the right, one band at a time: a line across the whole
 * page (title, abstract, a wide figure's caption) ends one band and starts
 * the next. Sets each line's `col` and `colRight`. */
export function readingOrder(lines: Line[], pageWidth: number): Line[] {
  const mid = pageWidth / 2;
  const slack = pageWidth * 0.02;
  for (const l of lines) {
    l.col = l.x2 <= mid + slack ? 1 : l.x >= mid - slack ? 2 : 0;
  }
  const left = lines.filter((l) => l.col === 1).length;
  const right = lines.filter((l) => l.col === 2).length;
  // One column: whatever sits to one side is just short lines.
  const twoColumns = left >= 5 && right >= 5;
  if (!twoColumns) {
    for (const l of lines) l.col = 0;
  }

  const byPosition = (a: Line, b: Line) => a.y - b.y || a.x - b.x;
  const sorted = [...lines].sort(byPosition);
  const out: Line[] = [];

  if (!twoColumns) {
    const right = Math.max(...sorted.map((l) => l.x2), 0);
    for (const l of sorted) l.colRight = right;
    return sorted;
  }

  // Right edges, per column.
  const edge = [0, 0, 0];
  for (const l of sorted) edge[l.col] = Math.max(edge[l.col], l.x2);
  for (const l of sorted) l.colRight = edge[l.col];

  let band: Line[] = [];
  const flush = () => {
    out.push(
      ...band.filter((l) => l.col === 1).sort(byPosition),
      ...band.filter((l) => l.col === 2).sort(byPosition),
    );
    band = [];
  };
  for (const l of sorted) {
    if (l.col === 0) {
      flush();
      out.push(l);
    } else band.push(l);
  }
  flush();
  return out;
}

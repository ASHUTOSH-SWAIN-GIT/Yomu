import type { Line } from "@/lib/pdf/lines";
import type { Box } from "@/lib/pdf/types";

/**
 * Figures, tables and display equations. Their text (axis labels, table
 * cells, symbols) reads as nonsense when it is reflowed, so each is cut
 * from the drawn page as a picture instead (see render.ts) and its lines
 * leave the text. A figure or table is found from its caption ("Figure 3:",
 * "Table 2."): the pictures, drawings and loose lines beside the caption,
 * up to the nearest paragraph of body text. Pictures without a caption
 * count too, and so do centred lines set in math fonts.
 */

export type RegionKind = "figure" | "table" | "equation" | "image";

export interface Region {
  /** Unique in the paper: "p5-1". */
  id: string;
  page: number;
  kind: RegionKind;
  /** The area to cut out, in PDF points from the page's top left. */
  x: number;
  y: number;
  x2: number;
  y2: number;
  /** The caption's text, when it has one. */
  caption: string | null;
  /** The text inside it (for search and the agent; never shown). */
  text: string;
  /** The lines it takes out of the text (its own, and its caption's). */
  lines: Set<Line>;
}

export const CAPTION = /^(figure|fig\.|table|algorithm)\s*[\dA-Z]+[.:]/i;
const PAD = 3;
/** Figures get more room at the sides: a rotated axis label sits just
 * outside the drawing, and pdf.js does not place rotated text exactly. */
const FIGURE_PAD_X = 10;

interface Span {
  x: number;
  x2: number;
}

const top = (l: Line) => l.y - l.size * 0.85;
const NUMBERED_HEADING = /^\d{1,2}(\.\d{1,2}){0,3}\.?\s+[A-Z]/;
/** A section heading: numbered and short, or larger than the text. */
const isHeading = (l: Line, body: number) =>
  l.text.length < 100 &&
  ((NUMBERED_HEADING.test(l.text) && (l.bold || l.size >= body * 1.05)) ||
    l.size >= body * 1.15);
const bottom = (l: Line) => l.y + l.size * 0.3;
const overlap = (a: Span, b: Span) => Math.min(a.x2, b.x2) - Math.max(a.x, b.x);

/** The page's columns: their left and right edges. */
function columns(lines: Line[]): Record<0 | 1 | 2, Span> {
  const edges = (col: 0 | 1 | 2 | null): Span => {
    const of = lines.filter((l) => col === null || l.col === col);
    if (of.length === 0) return { x: 0, x2: 0 };
    return {
      x: Math.min(...of.map((l) => l.x)),
      x2: Math.max(...of.map((l) => l.x2)),
    };
  };
  const all = edges(null);
  const left = edges(1);
  const right = edges(2);
  return {
    0: all,
    1: left.x2 > left.x ? left : all,
    2: right.x2 > right.x ? right : all,
  };
}

/** A line of running text: body size, most of the column wide, several
 * words. Labels, cells and symbols are not. */
function isProse(l: Line, body: number, width: number): boolean {
  return (
    !l.mono &&
    l.size >= body * 0.92 &&
    l.size <= body * 1.15 &&
    l.x2 - l.x >= width * 0.55 &&
    l.text.length >= 20 &&
    l.text.split(/\s+/).length >= 4 &&
    !CAPTION.test(l.text)
  );
}

/** The lines of a caption: its first line and the ones that carry on
 * under it (same column and size, close together). */
function captionLines(start: Line, page: Line[]): Line[] {
  const out = [start];
  const after = page.slice(page.indexOf(start) + 1);
  for (const l of after) {
    const prev = out[out.length - 1];
    if (
      l.col !== start.col ||
      CAPTION.test(l.text) ||
      Math.abs(l.size - start.size) > 0.6 ||
      l.y - prev.y > start.size * 1.6 ||
      l.y < prev.y
    ) {
      break;
    }
    out.push(l);
  }
  return out;
}

function unionOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
    image: boxes.some((b) => b.image),
  };
}

const lineBox = (l: Line): Box => ({
  x: l.x,
  y: top(l),
  x2: l.x2,
  y2: bottom(l),
  image: false,
});

/** What is next to a caption, on one side: the drawings and loose lines up
 * to the nearest prose (or the page's edge). */
function zone(
  side: "above" | "below",
  caption: Line[],
  span: Span,
  cols: Record<0 | 1 | 2, Span>,
  page: Line[],
  graphics: Box[],
  body: number,
  bounds: { top: number; bottom: number },
) {
  const first = caption[0];
  const last = caption[caption.length - 1];
  const width = span.x2 - span.x;
  const inSpan = (l: Line) =>
    !l.region &&
    !caption.includes(l) &&
    overlap(l, span) >= Math.min(l.x2 - l.x, width) * 0.5;
  const candidates = page
    .filter(inSpan)
    .filter((l) => (side === "above" ? l.y < first.y : l.y > last.y))
    .sort((a, b) => (side === "above" ? b.y - a.y : a.y - b.y));

  // Prose is judged against its own column: on a two-column page a figure
  // across both has a column of text beside it on each side.
  const prose = (l: Line) => isProse(l, body, cols[l.col].x2 - cols[l.col].x);
  const loose: Line[] = [];
  let edge = side === "above" ? bounds.top : bounds.bottom;
  for (let i = 0; i < candidates.length; i++) {
    const l = candidates[i];
    // A short line ending a paragraph is prose too, when prose runs on
    // right beside it.
    const next = candidates[i + 1];
    const tail =
      side === "above" &&
      next !== undefined &&
      prose(next) &&
      l.y - next.y < l.size * 1.6 &&
      Math.abs(l.size - body) < body * 0.1;
    if (prose(l) || tail || isHeading(l, body) || CAPTION.test(l.text)) {
      edge = side === "above" ? bottom(l) : top(l);
      break;
    }
    loose.push(l);
  }
  const from = side === "above" ? edge : bottom(last);
  const to = side === "above" ? top(first) : edge;
  const drawn = graphics.filter((g) => {
    const mid = (g.y + g.y2) / 2;
    return (
      overlap(g, span) > Math.min(g.x2 - g.x, width) * 0.5 &&
      mid > from &&
      mid < to
    );
  });
  return { loose, drawn, from, to };
}

/** The figures, tables and pictures on one page. */
function captioned(
  page: Line[],
  graphics: Box[],
  body: number,
  number: number,
  bounds: { top: number; bottom: number },
): Region[] {
  const cols = columns(page);
  const out: Region[] = [];
  for (const start of page) {
    if (start.region || !CAPTION.test(start.text)) continue;
    if (out.some((r) => r.lines.has(start))) continue;
    const caption = captionLines(start, page);
    const span = cols[start.col];
    const table = /^table/i.test(start.text);
    const above = zone(
      "above",
      caption,
      span,
      cols,
      page,
      graphics,
      body,
      bounds,
    );
    const below = zone(
      "below",
      caption,
      span,
      cols,
      page,
      graphics,
      body,
      bounds,
    );
    const weight = (z: typeof above) =>
      z.drawn.reduce((n, g) => n + (g.x2 - g.x) * (g.y2 - g.y), 0) +
      z.loose.length * 200;
    // Figures carry their caption under them; tables either way, so the
    // side with more on it wins.
    const pick =
      weight(above) === 0 && weight(below) > 0
        ? below
        : table && weight(below) > weight(above)
          ? below
          : above;

    let area = unionOf([...pick.drawn, ...pick.loose.map(lineBox)]);
    // Nothing found (a picture pdf.js does not report): the whole gap, if
    // there is one.
    if (!area && pick.to - pick.from > 40) {
      area = {
        x: span.x,
        y: pick.from,
        x2: span.x2,
        y2: pick.to,
        image: false,
      };
    }
    if (!area || area.y2 - area.y < 12 || area.x2 - area.x < 24) continue;

    // Clip to the zone, so a page-wide box cannot swallow the text.
    const y = Math.max(area.y, pick.from);
    const y2 = Math.min(area.y2, pick.to);
    const inside = page.filter(
      (l) =>
        !l.region &&
        l.y > y &&
        l.y < y2 + l.size * 0.3 &&
        overlap(l, area!) > (l.x2 - l.x) * 0.5,
    );
    const capText = caption.map((l) => l.text).join(" ");
    const padX = table ? PAD : FIGURE_PAD_X;
    out.push({
      id: `p${number}-${out.length + 1}`,
      page: number,
      kind: table ? "table" : "figure",
      x: area.x - padX,
      y: y - PAD,
      x2: area.x2 + padX,
      y2: y2 + PAD,
      caption: capText.replace(/\s+/g, " ").trim(),
      text: inside.map((l) => l.text).join(" "),
      lines: new Set([...inside, ...caption]),
    });
  }
  return out;
}

/** Pictures with no caption: big enough to be content, not a logo or a
 * rule. */
function loosePictures(
  page: Line[],
  graphics: Box[],
  taken: Region[],
  number: number,
): Region[] {
  const out: Region[] = [];
  for (const g of graphics) {
    if (!g.image || g.x2 - g.x < 60 || g.y2 - g.y < 40) continue;
    const covered = [...taken, ...out].some(
      (r) => overlap(g, r) > 0 && Math.min(g.y2, r.y2) - Math.max(g.y, r.y) > 0,
    );
    if (covered) continue;
    const inside = page.filter(
      (l) =>
        !l.region &&
        l.y > g.y &&
        l.y < g.y2 &&
        overlap(l, g) > (l.x2 - l.x) * 0.5,
    );
    out.push({
      id: `p${number}-${taken.length + out.length + 1}`,
      page: number,
      kind: "image",
      x: g.x - FIGURE_PAD_X,
      y: g.y - PAD,
      x2: g.x2 + FIGURE_PAD_X,
      y2: g.y2 + PAD,
      caption: null,
      text: inside.map((l) => l.text).join(" "),
      lines: new Set(inside),
    });
  }
  return out;
}

const EQUATION_NUMBER = /^\(\d{1,3}[a-z]?\)$/;

/** Display equations: lines mostly in math fonts, centred in their column
 * and narrower than it, with their number "(3)" if it sits beside them. */
function equations(page: Line[], taken: Region[], number: number): Region[] {
  const cols = columns(page);
  const used = new Set(taken.flatMap((r) => [...r.lines]));
  const isEquation = (l: Line) => {
    const col = cols[l.col];
    const width = col.x2 - col.x;
    const centre = (l.x + l.x2) / 2;
    return (
      !used.has(l) &&
      !l.region &&
      // Mostly math fonts, or some with a relation in it (a derivation
      // written as "a < b (assumption)").
      ((l.math ?? 0) >= 0.3 ||
        ((l.math ?? 0) >= 0.12 && /[<>≤≥=≈≡⇒→⊂⊆∈]/.test(l.text))) &&
      l.x2 - l.x < width * 0.85 &&
      Math.abs(centre - (col.x + col.x2) / 2) < width * 0.15
    );
  };
  const out: Region[] = [];
  let group: Line[] = [];
  const flush = () => {
    if (group.length > 0) {
      // The equation's number, on the same baseline at the right.
      const numbers = page.filter(
        (l) =>
          !used.has(l) &&
          EQUATION_NUMBER.test(l.text) &&
          group.some((g) => Math.abs(g.y - l.y) < 2),
      );
      const all = [...group, ...numbers];
      // Room for superscripts above and subscripts below the baseline.
      const box = unionOf(
        all.map((l) => ({
          x: l.x,
          y: l.y - l.size * 1.3,
          x2: l.x2,
          y2: l.y + l.size * 0.55,
          image: false,
        })),
      )!;
      // Touching the equation before it (one derivation, read in two
      // groups): one picture.
      const prev = out[out.length - 1];
      if (
        prev &&
        box.y - PAD <= prev.y2 + 2 &&
        overlap(box, { x: prev.x, x2: prev.x2 }) > 0
      ) {
        prev.x = Math.min(prev.x, box.x - PAD);
        prev.x2 = Math.max(prev.x2, box.x2 + PAD);
        prev.y2 = Math.max(prev.y2, box.y2 + PAD);
        prev.text += " " + group.map((l) => l.text).join(" ");
        for (const l of all) prev.lines.add(l);
        group = [];
        return;
      }
      out.push({
        // "eq" in the name: the reader shows no caption for these.
        id: `p${number}-eq${out.length + 1}`,
        page: number,
        kind: "equation",
        x: box.x - PAD,
        y: box.y - PAD,
        x2: box.x2 + PAD,
        y2: box.y2 + PAD,
        caption: null,
        text: group.map((l) => l.text).join(" "),
        lines: new Set(all),
      });
    }
    group = [];
  };
  for (const l of page) {
    if (!isEquation(l)) {
      if (!EQUATION_NUMBER.test(l.text)) flush();
      continue;
    }
    const prev = group[group.length - 1];
    if (prev && (l.col !== prev.col || l.y - prev.y > l.size * 2.5)) flush();
    group.push(l);
  }
  flush();
  return out;
}

/** Everything to cut from one page, in no particular order. */
export function findRegions(
  page: Line[],
  graphics: Box[],
  body: number,
  number: number,
  size: { width: number; height: number },
): Region[] {
  const pageHeight = size.height;
  // Huge boxes (a page border, a coloured background) say nothing.
  const useful = graphics.filter(
    (g) => (g.x2 - g.x) * (g.y2 - g.y) < 0.6 * size.width * size.height,
  );
  // The page's printed area: its text and pictures (a page may start with
  // a figure, above any text).
  const bounds = {
    top: Math.max(
      0,
      Math.min(...page.map(top), ...useful.map((g) => g.y), pageHeight) - 4,
    ),
    bottom: Math.min(
      pageHeight,
      Math.max(...page.map(bottom), ...useful.map((g) => g.y2), 0) + 4,
    ),
  };
  const figures = captioned(page, useful, body, number, bounds);
  const pictures = loosePictures(page, useful, figures, number);
  const maths = equations(page, [...figures, ...pictures], number);
  return [...figures, ...pictures, ...maths];
}

/** A page's lines with each region's lines taken out, and one stand-in
 * line put where the region was (where its first line was read, or at the
 * first line under it). */
export function placeRegions(page: Line[], regions: Region[]): Line[] {
  if (regions.length === 0) return page;
  const out = page.filter((l) => !regions.some((r) => r.lines.has(l)));
  for (const region of [...regions].sort((a, b) => a.y - b.y)) {
    const stand: Line = {
      page: region.page,
      x: region.x,
      x2: region.x2,
      y: region.y,
      rel: 0,
      size: 0,
      runs: [],
      text: "",
      bold: false,
      mono: false,
      col: 0,
      colRight: region.x2,
      region,
    };
    const firstOwn = page.findIndex((l) => region.lines.has(l));
    let at: number;
    if (firstOwn >= 0) {
      // Before whatever followed the region's first line.
      const before = page.slice(0, firstOwn).filter((l) => out.includes(l));
      at = before.length > 0 ? out.indexOf(before[before.length - 1]) + 1 : 0;
      // Other stand-ins already placed there keep their order.
      while (out[at]?.region && out[at].region!.y <= region.y) at++;
    } else {
      at = out.findIndex(
        (l) =>
          !l.region &&
          l.y > region.y2 &&
          overlap(l, region) > (l.x2 - l.x) * 0.5,
      );
      if (at < 0) at = out.length;
    }
    out.splice(at, 0, stand);
  }
  return out;
}

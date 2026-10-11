import type { Line, Run } from "@/lib/pdf/lines";
import { CAPTION, type Region } from "@/lib/pdf/regions";
import type { Block, ListItem, Span } from "@/types/article";

export interface PlacedBlock {
  block: Block;
  page: number;
}

/** The size most of the text is in. */
export function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    if (l.mono) continue;
    const k = Math.round(l.size * 2) / 2;
    weight.set(k, (weight.get(k) ?? 0) + l.text.length);
  }
  let best = 10;
  let most = 0;
  for (const [size, w] of weight) {
    if (w > most) {
      most = w;
      best = size;
    }
  }
  return best;
}

const SENTENCE_END = /[.?!:;]["”')\]]?$/;
const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+\S/;
const APPENDIX = /^([A-Z])(\.\d{1,2})*\.?\s+[A-Z]/;
const SECTION_NAME =
  /^(\d+\.?\s+)?(abstract|introduction|references|bibliography|acknowledg(e)?ments?|conclusions?|appendix|related work|background|discussion|methods?|results|limitations)\b/i;
const BULLET = /^([•●▪◦‣∙·–—-]|\(\w{1,3}\)|\w{1,2}\))\s+(?=\S)/;
const REFERENCES = /^(\d+\.?\s+)?(references|bibliography)$/i;

function headingLevel(line: Line, body: number): number | null {
  const text = line.text;
  if (text.length < 2 || text.length > 130 || CAPTION.test(text)) return null;
  if (/^[\d\s.,()-]+$/.test(text)) return null;
  const big = line.size >= body * 1.12;
  const named = SECTION_NAME.test(text) && text.split(/\s+/).length <= 4;
  const bold = line.bold && !line.mono;
  const numbered = NUMBERED.exec(text) ?? null;
  const words = text.split(/\s+/).length;

  const looksLike =
    big ||
    (bold && words <= 14 && !/[.,;]$/.test(text)) ||
    (named && (bold || big || text === text.toUpperCase()));
  if (!looksLike) return null;

  if (numbered) {
    return Math.min(4, numbered[1].split(".").length + 1);
  }
  if (APPENDIX.test(text) && bold) return 2;
  if (line.size >= body * 1.5) return 2;
  if (line.size >= body * 1.25) return 3;
  return named ? 2 : 3;
}

function spansOf(runs: Run[]): Span[] {
  const spans: Span[] = [];
  for (const r of runs) {
    if (r.text === "") continue;
    const last = spans[spans.length - 1];
    const same =
      last &&
      !!last.bold === r.bold &&
      !!last.italic === r.italic &&
      !!last.code === r.mono &&
      last.href === r.href;
    if (same) last.text += r.text;
    else {
      const span: Span = { text: r.text };
      if (r.bold) span.bold = true;
      if (r.italic) span.italic = true;
      if (r.mono) span.code = true;
      if (r.href) span.href = r.href;
      spans.push(span);
    }
  }
  // A paragraph that is all bold or all italic is a style of the page, not
  // emphasis.
  return spans;
}

function appendRuns(into: Run[], runs: Run[]) {
  const last = into[into.length - 1];
  const next = runs[0];
  if (last && next) {
    const lastChar = last.text.replace(/\s+$/, "").slice(-1);
    const firstChar = next.text.trimStart()[0] ?? "";
    if (lastChar === "-" && /[a-z]/.test(firstChar)) {
      // A word split at the end of a line.
      last.text = last.text.replace(/\s+$/, "").slice(0, -1);
    } else if (!last.text.endsWith(" ")) {
      last.text += " ";
    }
  }
  for (const r of runs) into.push({ ...r });
}

/** Lines, in reading order, to the blocks of an article. A stand-in line
 * for a figure (see regions.ts) becomes the block `regionBlock` makes. */
export function toBlocks(
  lines: Line[],
  body: number,
  regionBlock?: (region: Region) => Block,
): PlacedBlock[] {
  const out: PlacedBlock[] = [];
  let para: { runs: Run[]; page: number } | null = null;
  let list: { items: ListItem[]; page: number } | null = null;
  let code: { rows: string[]; page: number } | null = null;
  let heading: {
    text: string;
    level: number;
    page: number;
    last: Line;
  } | null = null;
  let inReferences = false;
  let refLeft = Infinity;
  let prev: Line | null = null;

  const endPara = () => {
    if (para && para.runs.length > 0) {
      const spans = spansOf(para.runs);
      if (spans.some((s) => s.text.trim() !== "")) {
        out.push({ block: { type: "paragraph", spans }, page: para.page });
      }
    }
    para = null;
  };
  const endList = () => {
    if (list && list.items.length > 0) {
      out.push({
        block: { type: "list", ordered: false, items: list.items },
        page: list.page,
      });
    }
    list = null;
  };
  const endCode = () => {
    if (code && code.rows.length > 0) {
      out.push({
        block: {
          type: "code",
          language: null,
          content: code.rows.join("\n"),
        },
        page: code.page,
      });
    }
    code = null;
  };
  const endHeading = () => {
    if (heading) {
      out.push({
        block: {
          type: "heading",
          level: heading.level,
          text: heading.text,
        },
        page: heading.page,
      });
      inReferences = REFERENCES.test(heading.text.trim());
      refLeft = Infinity;
    }
    heading = null;
  };
  const endAll = () => {
    endHeading();
    endPara();
    endList();
    endCode();
  };

  for (const line of lines) {
    if (line.region) {
      endAll();
      if (regionBlock) {
        out.push({ block: regionBlock(line.region), page: line.page });
      }
      prev = null;
      continue;
    }
    const level = headingLevel(line, body);

    if (level !== null) {
      // The next line of a heading that wraps.
      if (
        heading &&
        line.page === heading.last.page &&
        line.y - heading.last.y < line.size * 1.7 &&
        Math.abs(line.size - heading.last.size) < 0.6 &&
        !NUMBERED.test(line.text)
      ) {
        heading.text += " " + line.text;
        heading.last = line;
        prev = line;
        continue;
      }
      endAll();
      heading = { text: line.text, level, page: line.page, last: line };
      prev = line;
      continue;
    }
    endHeading();

    // Code: monospace lines, kept as they are.
    if (line.mono && !inReferences) {
      endPara();
      endList();
      if (!code) code = { rows: [], page: line.page };
      code.rows.push(line.text);
      prev = line;
      continue;
    }
    endCode();

    if (inReferences) {
      refLeft = Math.min(refLeft, line.x);
      const startsEntry =
        /^\[\d+\]/.test(line.text) ||
        /^\d{1,3}\.\s/.test(line.text) ||
        line.x <= refLeft + line.size * 0.3;
      if (startsEntry || !para) {
        endPara();
        para = { runs: [], page: line.page };
      }
      appendRuns(para!.runs, line.runs);
      prev = line;
      continue;
    }

    const bullet = BULLET.exec(line.text);
    if (bullet && !CAPTION.test(line.text)) {
      endPara();
      if (!list) list = { items: [], page: line.page };
      const runs = line.runs.map((r) => ({ ...r }));
      // Take the marker off the front.
      let toCut = bullet[0].length;
      for (const r of runs) {
        const cut = Math.min(toCut, r.text.length);
        r.text = r.text.slice(cut);
        toCut -= cut;
        if (toCut <= 0) break;
      }
      list.items.push({ spans: spansOf(runs), depth: 0 });
      prev = line;
      continue;
    }

    // A line continuing a list item (indented under its text).
    if (list && prev && line.x > prev.x - 1 && !SENTENCE_END.test(prev.text)) {
      const item = list.items[list.items.length - 1];
      const runs: Run[] = item.spans.map((s) => ({
        text: s.text,
        bold: !!s.bold,
        italic: !!s.italic,
        mono: !!s.code,
        ...(s.href ? { href: s.href } : {}),
      }));
      appendRuns(runs, line.runs);
      item.spans = spansOf(runs);
      prev = line;
      continue;
    }
    endList();

    // Whether this line starts a new paragraph.
    let breaks = !para;
    if (para && prev) {
      const sameFlow = line.page === prev.page && line.y >= prev.y - 1;
      const ended = SENTENCE_END.test(prev.text);
      if (!sameFlow) {
        breaks = ended;
      } else {
        const gap = line.y - prev.y;
        const indented = line.x > prev.x + line.size * 0.9 && line.x < prev.x2;
        const shortPrev = prev.x2 < prev.colRight - line.size * 2.5 && ended;
        breaks =
          gap > line.size * 1.5 ||
          (indented && ended) ||
          shortPrev ||
          CAPTION.test(line.text);
      }
    }
    if (breaks) {
      endPara();
      para = { runs: [], page: line.page };
    }
    appendRuns(para!.runs, line.runs);
    prev = line;
  }
  endAll();

  return out;
}

/** Footnotes, one block each, set apart from the text (a quote block). */
export function notesToBlocks(notes: Line[]): PlacedBlock[] {
  const out: PlacedBlock[] = [];
  // A note starts at its mark (which may be a line of its own).
  const MARK = /^[\d∗*†‡§¶]{1,2}(\s|$)/;
  const ONLY_MARK = /^[\d∗*†‡§¶]{1,2}$/;
  let current: { runs: Run[]; page: number } | null = null;
  const flush = () => {
    if (current) {
      out.push({
        block: { type: "quote", spans: spansOf(current.runs) },
        page: current.page,
      });
    }
    current = null;
  };
  for (const n of notes) {
    const startsNew =
      !current ||
      n.page !== current.page ||
      (MARK.test(n.text) &&
        !ONLY_MARK.test(
          current.runs
            .map((r) => r.text)
            .join("")
            .trim(),
        ));
    if (startsNew) {
      flush();
      current = { runs: [], page: n.page };
    }
    appendRuns(current!.runs, n.runs);
  }
  flush();
  return out;
}

/** The small print at the foot of a page: from the first small line low
 * on the page to the end of it (captions are left where they are). Small
 * lines with body text still under them in their column are not notes
 * (a display formula, a code sample), and nothing in the references is. */
export function splitFootnotes(
  lines: Line[],
  body: number,
): { body: Line[]; notes: Line[] } {
  const notes: Line[] = [];
  const rest: Line[] = [];
  const startOf = new Map<number, number>();
  const referencesAt = lines.findIndex((l) => REFERENCES.test(l.text.trim()));
  const isSmall = (l: Line) => !l.region && l.size <= body * 0.93;
  const sameColumn = (a: Line, b: Line) =>
    a.col === 0 || b.col === 0 || a.col === b.col;
  lines.forEach((l, i) => {
    if (referencesAt >= 0 && i >= referencesAt) return;
    if (!isSmall(l) || l.rel <= 0.65 || CAPTION.test(l.text)) return;
    if (startOf.has(l.page)) return;
    const textBelow = lines.some(
      (m) =>
        m.page === l.page &&
        !m.region &&
        !isSmall(m) &&
        m.y > l.y + 1 &&
        sameColumn(l, m),
    );
    if (!textBelow) startOf.set(l.page, i);
  });
  lines.forEach((l, i) => {
    const from = startOf.get(l.page);
    // Only the very end of the page's lines, small ones, count.
    const inNotes = from !== undefined && i >= from && isSmall(l);
    if (inNotes) notes.push(l);
    else rest.push(l);
  });
  return { body: rest, notes };
}

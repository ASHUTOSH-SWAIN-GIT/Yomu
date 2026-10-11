import { blockText } from "@/lib/article-text";
import type { Block } from "@/types/article";

/** Numbered citations in a paper's text: "[12]", "[3, 7]", "[4–6]". */
const CITE = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;
const REFERENCES = /^(\d+\.?\s+)?(references|bibliography)$/i;
/** A reference entry's own number: "[12] A. Author…" or "12. A. Author…". */
const ENTRY = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})\.)\s+(\S[\s\S]*)$/;

/** The paper's reference list, by number, from the paragraphs under its
 * References heading. Empty when the paper has none, or names its sources
 * another way ("Vaswani et al., 2017"). */
export function referencesOf(blocks: Block[]): Map<string, string> {
  const refs = new Map<string, string>();
  const start = blocks.findIndex(
    (b) => b.type === "heading" && REFERENCES.test(b.text.trim()),
  );
  if (start < 0) return refs;
  for (const block of blocks.slice(start + 1)) {
    if (block.type === "heading") break;
    if (block.type !== "paragraph") continue;
    const m = ENTRY.exec(blockText(block));
    if (m) refs.set(m[1] ?? m[2], m[3].trim());
  }
  return refs;
}

/** "3, 5–7" to ["3", "5", "6", "7"] (a range of at most 20). */
export function citedNumbers(inside: string): string[] {
  const out: string[] = [];
  for (const part of inside.split(",")) {
    const [a, b] = part.split(/[–-]/).map((s) => Number(s.trim()));
    if (!Number.isFinite(a)) continue;
    if (Number.isFinite(b) && b >= a && b - a <= 20) {
      for (let n = a; n <= b; n++) out.push(String(n));
    } else out.push(String(a));
  }
  return out;
}

export interface CitationMatch {
  start: number;
  end: number;
  numbers: string[];
}

/** Where a text cites references, keeping only citations whose numbers
 * are all in the list (so "[sic]" or an array index are left alone). */
export function findCitations(
  text: string,
  refs: Map<string, string>,
): CitationMatch[] {
  const out: CitationMatch[] = [];
  for (const m of text.matchAll(CITE)) {
    const numbers = citedNumbers(m[1]);
    if (numbers.length > 0 && numbers.every((n) => refs.has(n))) {
      out.push({ start: m.index, end: m.index + m[0].length, numbers });
    }
  }
  return out;
}

import { parseImageQuote } from "@/lib/images";

/** A term the agent has explained before, with the answer it gave. */
export interface GlossaryTerm {
  /** The words as they were selected (cleaned of stray spaces). */
  term: string;
  /** The answer, as Markdown. */
  answer: string;
  articleId: string;
  articleTitle: string;
}

/** What the database gives: one row per explained passage. `answeredAt`
 * orders them, so a later explanation of the same term wins. */
export interface GlossaryRow {
  text: string;
  answer: string | null;
  articleId: string;
  articleTitle: string;
  answeredAt: number;
}

const MIN_CHARS = 3;
const MAX_CHARS = 40;
const MAX_WORDS = 4;

/** The words of a selected passage if they make a term (a name, a phrase:
 * a few words, no sentence), else null. Longer passages are explained in
 * place; they are not something to underline everywhere. */
export function cleanTerm(text: string): string | null {
  if (parseImageQuote(text)) return null;
  const term = text
    .replace(/\s+/g, " ")
    .trim()
    // Quotes and commas picked up at the edges of a selection.
    .replace(/^[\s"'“”‘’([,;:.]+|[\s"'“”‘’)\],;:.]+$/g, "");
  if (term.length < MIN_CHARS || term.length > MAX_CHARS) return null;
  if (term.split(" ").length > MAX_WORDS) return null;
  // A full stop or question mark inside means a sentence, not a term.
  if (/[.!?]\s/.test(term)) return null;
  if (!/\p{L}/u.test(term)) return null;
  return term;
}

/** The glossary from explained passages: one entry per term (compared
 * without regard to case), the most recent answer winning. */
export function buildGlossary(rows: GlossaryRow[]): GlossaryTerm[] {
  const byKey = new Map<string, { entry: GlossaryTerm; at: number }>();
  for (const row of rows) {
    const term = cleanTerm(row.text);
    const answer = row.answer?.trim();
    if (!term || !answer) continue;
    const key = term.toLowerCase();
    const seen = byKey.get(key);
    if (seen && seen.at > row.answeredAt) continue;
    byKey.set(key, {
      at: row.answeredAt,
      entry: {
        term,
        answer,
        articleId: row.articleId,
        articleTitle: row.articleTitle,
      },
    });
  }
  return [...byKey.values()].map((v) => v.entry);
}

export interface TermMatch {
  start: number;
  end: number;
  entry: GlossaryTerm;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An acronym ("CAP", "ACID") is matched exactly; "cap" is a different word. */
const isAcronym = (term: string) => term === term.toUpperCase();

/** A function that finds the glossary terms in some text: whole words only,
 * longest first, never overlapping. Built once per glossary. */
export function termFinder(
  glossary: GlossaryTerm[],
): (text: string) => TermMatch[] {
  if (glossary.length === 0) return () => [];
  const byLower = new Map(glossary.map((g) => [g.term.toLowerCase(), g]));
  const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);
  const pattern = (list: GlossaryTerm[]) =>
    list.map((g) => escapeRegExp(g.term)).join("|");
  const edge = (p: string) => `(?<![\\p{L}\\p{N}])(?:${p})(?![\\p{L}\\p{N}])`;
  const acronyms = sorted.filter((g) => isAcronym(g.term));
  const words = sorted.filter((g) => !isAcronym(g.term));
  const wordRe = words.length ? new RegExp(edge(pattern(words)), "giu") : null;
  const acronymRe = acronyms.length
    ? new RegExp(edge(pattern(acronyms)), "gu")
    : null;

  return (text) => {
    const found: TermMatch[] = [];
    for (const re of [wordRe, acronymRe]) {
      if (!re) continue;
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const entry = byLower.get(m[0].toLowerCase());
        if (entry)
          found.push({
            start: m.index,
            end: m.index + m[0].length,
            entry,
          });
      }
    }
    // Longest first, then drop what overlaps a longer or earlier match.
    found.sort(
      (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
    );
    const out: TermMatch[] = [];
    for (const m of found) {
      if (out.length === 0 || m.start >= out[out.length - 1].end) out.push(m);
    }
    return out;
  };
}

/** The start of an answer: whole paragraphs while they fit in `max`
 * characters, cut with "…" if even the first does not. */
export function gist(answer: string, max = 420): string {
  const paragraphs = answer.trim().split(/\n{2,}/);
  let out = "";
  for (const p of paragraphs) {
    const next = out ? `${out}\n\n${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out === answer.trim() ? out : `${out} …`;
  return `${paragraphs[0].slice(0, max).trimEnd()} …`;
}

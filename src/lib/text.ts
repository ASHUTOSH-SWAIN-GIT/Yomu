/** The first sentence of `text` (up to a `.`, `!` or `?`), collapsed to one
 * line and capped at `maxLen`. Falls back to the whole (capped) text when
 * no sentence terminator is found. Used to gist a past answer down to one
 * line (see lib/exchanges.ts's `priorExplanations`). */
export function firstSentence(text: string, maxLen = 140): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const match = /^[^.!?]*[.!?]/.exec(trimmed);
  const sentence = match ? match[0] : trimmed;
  return sentence.length > maxLen
    ? `${sentence.slice(0, maxLen - 1)}…`
    : sentence;
}

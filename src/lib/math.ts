import katex from "katex";

/**
 * KaTeX's HTML for TeX that runs inside a sentence, or null if it cannot be
 * rendered at all. Only the HTML half is produced: KaTeX's MathML copy would
 * put every symbol in the text twice, which shows up when selecting, copying
 * or commenting on a passage (the reader gives the span an `aria-label`
 * instead). Bad TeX shows as KaTeX's red source, as it does in `MathBlock`.
 */
export function inlineMathHtml(tex: string): string | null {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: false,
      output: "html",
    });
  } catch {
    return null;
  }
}

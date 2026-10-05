/** Splits a command line into words the way a shell would for simple cases:
 * spaces separate words, and single or double quotes keep spaces inside one.
 * Nothing is run or expanded; this only builds the argument list. */
export function splitWords(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | null = null;
  let inWord = false;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += char;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/** The reverse, for showing saved arguments in a text field. */
export function joinWords(words: string[]): string {
  return words
    .map((w) => (w === "" || /[\s"']/.test(w) ? JSON.stringify(w) : w))
    .join(" ");
}

import { articleText } from "@/lib/article-text";
import type { Block } from "@/types/article";

// Typical adult silent reading speed for technical prose.
const WORDS_PER_MINUTE = 220;

/** Estimated minutes to read an article, at least 1. */
export function readingMinutes(blocks: Block[]): number {
  const words = articleText(blocks).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

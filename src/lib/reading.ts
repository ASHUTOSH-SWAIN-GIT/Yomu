import { articleText } from "@/lib/article-text";
import type { Block } from "@/types/article";

// Typical adult silent reading speed for technical prose.
const WORDS_PER_MINUTE = 220;

/** Estimated minutes to read an article, at least 1. */
export function readingMinutes(blocks: Block[]): number {
  const words = articleText(blocks).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** How far through a saved article you are, in words a list can use. */
export const started = (a: { progress: number }) => a.progress > 0.001;
export const finished = (a: { progress: number }) => a.progress >= 0.95;
/** Read part of something: started, and not yet at the end. */
export const inProgress = (a: { progress: number }) =>
  started(a) && !finished(a);

/** "12 Oct": when something was saved, for a list row. */
export function savedOn(a: { scrapedAt: number }): string {
  return new Date(a.scrapedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

import type { Block } from "@/types/article";
import type { StoredArticle } from "@/types/library";

export const p = (text: string): Block => ({
  type: "paragraph",
  spans: [{ text }],
});

export function makeArticle(
  blocks: Block[],
  over: Partial<StoredArticle> = {},
) {
  return {
    id: "a1",
    url: "https://example.dev/post",
    canonicalUrl: "https://example.dev/post",
    title: "Ownership in Rust",
    author: null,
    site: "example.dev",
    blocks,
    scrapedAt: 0,
    publishedAt: null,
    saved: true,
    progress: 0,
    archived: false,
    ...over,
  } satisfies StoredArticle;
}

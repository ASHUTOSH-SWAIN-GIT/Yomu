import type { Block } from "@/types/article";

/** A row from the `articles` table (see src-tauri/src/db.rs), fully
 * hydrated with parsed blocks. */
export interface StoredArticle {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  site: string;
  blocks: Block[];
  scrapedAt: number;
  saved: boolean;
}

/** Lightweight row for the library sidebar list — no blocks, so listing
 * doesn't pull the full article body for every row. */
export interface ArticleSummary {
  id: string;
  title: string;
  author: string | null;
  site: string;
  canonicalUrl: string;
  scrapedAt: number;
}

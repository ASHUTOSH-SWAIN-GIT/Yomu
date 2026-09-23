/**
 * Mirrors the Rust types in `src-tauri/src/scraper/blocks.rs` and
 * `src-tauri/src/scraper/mod.rs`. Keep the two in sync by hand for now;
 * there's no codegen step yet (see ROADMAP.md M2).
 */

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; spans: Span[] }
  | { type: "code"; language: string | null; content: string }
  | { type: "image"; src: string; alt: string | null }
  | { type: "math"; tex: string };

export interface ScrapedArticle {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  site: string;
  blocks: Block[];
  scrapedAt: number;
}

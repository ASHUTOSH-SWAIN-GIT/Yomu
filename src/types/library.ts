import type { MessageScope } from "@/lib/scope";
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
  publishedAt: number | null;
  saved: boolean;
  /** How far down the article the reader got, 0 to 1. */
  progress: number;
  archived: boolean;
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
  publishedAt: number | null;
  progress: number;
  archived: boolean;
  tags: string[];
  /** The site's logo address, when the page declared one. */
  icon?: string | null;
}

/** A note the reader wrote about a paragraph. `quote` is the text they had
 * selected when they wrote it. */
export interface Comment {
  id: string;
  articleId: string;
  blockIndex: number;
  /** Character offsets of the selected words in the block's text. */
  start: number;
  end: number;
  quote: string;
  note: string;
  createdAt: number;
}

/** One full-text search match. `kind` says where it matched. */
export interface SearchHit {
  articleId: string;
  kind: "article" | "chat";
  /** Snippet with matches wrapped in \u0001 ... \u0002 (never HTML). */
  snippet: string;
}

/** Another saved article whose text matches a passage/question, for
 * cross-article context in a prompt (see lib/db.ts's `relatedArticles`). */
export interface RelatedArticle {
  articleId: string;
  title: string;
  /** Plain text (match markers already stripped, unlike SearchHit). */
  snippet: string;
}

/** A passage the user asked the agent to explain. `blockIndex` and the
 * offsets locate it inside `article.blocks[blockIndex]`'s text. */
export interface Highlight {
  id: string;
  articleId: string;
  blockIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface Chat {
  id: string;
  articleId: string;
  acpSessionId: string | null;
}

/** `highlight` is set on the message that started an explain. `scope` is
 * stored for new rows and inferred for older ones (see lib/scope.ts). */
export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  scope: MessageScope;
  highlight: Highlight | null;
}

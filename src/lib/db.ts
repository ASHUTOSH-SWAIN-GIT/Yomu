import Database from "@tauri-apps/plugin-sql";
import type { Block } from "@/types/article";
import { articleText } from "@/lib/article-text";
import { normalizeTag } from "@/lib/tags";
import type {
  ArticleSummary,
  Chat,
  Highlight,
  RelatedArticle,
  SearchHit,
  StoredArticle,
  StoredMessage,
} from "@/types/library";
import type { ScrapedArticle } from "@/types/article";

// Must match `db::DB_URL` in src-tauri/src/db.rs.
const DB_URL = "sqlite:yomu.db";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

interface ArticleRow {
  id: string;
  url: string;
  canonical_url: string;
  title: string | null;
  author: string | null;
  site: string | null;
  blocks_json: string;
  scraped_at: number;
  published_at: number | null;
  saved: number;
  progress: number;
  archived: number;
}

function rowToStoredArticle(row: ArticleRow): StoredArticle {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title ?? row.site ?? row.url,
    author: row.author,
    site: row.site ?? "",
    blocks: JSON.parse(row.blocks_json) as Block[],
    scrapedAt: row.scraped_at,
    publishedAt: row.published_at,
    saved: row.saved === 1,
    progress: row.progress,
    archived: row.archived === 1,
  };
}

export async function listArticles(): Promise<ArticleSummary[]> {
  const db = await getDb();
  const rows = await db.select<
    (Pick<
      ArticleRow,
      | "id"
      | "url"
      | "canonical_url"
      | "title"
      | "author"
      | "site"
      | "scraped_at"
      | "published_at"
      | "progress"
      | "archived"
    > & { tags: string | null })[]
  >(
    `SELECT a.id, a.url, a.canonical_url, a.title, a.author, a.site, a.scraped_at,
            a.published_at, a.progress, a.archived,
            (SELECT group_concat(tag, char(31)) FROM article_tags t WHERE t.article_id = a.id) AS tags
     FROM articles a ORDER BY a.scraped_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? row.site ?? row.url,
    author: row.author,
    site: row.site ?? "",
    canonicalUrl: row.canonical_url,
    scrapedAt: row.scraped_at,
    publishedAt: row.published_at,
    progress: row.progress,
    archived: row.archived === 1,
    tags: row.tags ? row.tags.split("\u001f").sort() : [],
  }));
}

export async function getArticleByCanonicalUrl(
  canonicalUrl: string,
): Promise<StoredArticle | null> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    "SELECT * FROM articles WHERE canonical_url = $1 LIMIT 1",
    [canonicalUrl],
  );
  return rows[0] ? rowToStoredArticle(rows[0]) : null;
}

export async function getArticleById(
  id: string,
): Promise<StoredArticle | null> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    "SELECT * FROM articles WHERE id = $1 LIMIT 1",
    [id],
  );
  return rows[0] ? rowToStoredArticle(rows[0]) : null;
}

/**
 * Saves a freshly scraped article, or updates the existing row if this
 * canonical URL was already saved (same `id`, refreshed content) — the
 * `articles.canonical_url` unique constraint is what prevents duplicates.
 */
export async function upsertArticle(
  article: ScrapedArticle,
): Promise<StoredArticle> {
  const db = await getDb();
  const existing = await getArticleByCanonicalUrl(article.canonicalUrl);
  const id = existing?.id ?? crypto.randomUUID();
  const blocksJson = JSON.stringify(article.blocks);

  await db.execute(
    `INSERT INTO articles (id, url, canonical_url, title, author, site, blocks_json, scraped_at, published_at, saved, text_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
     ON CONFLICT(canonical_url) DO UPDATE SET
       url = excluded.url,
       title = excluded.title,
       author = excluded.author,
       site = excluded.site,
       blocks_json = excluded.blocks_json,
       text_content = excluded.text_content,
       scraped_at = excluded.scraped_at,
       published_at = excluded.published_at`,
    [
      id,
      article.url,
      article.canonicalUrl,
      article.title,
      article.author,
      article.site,
      blocksJson,
      article.scrapedAt,
      article.publishedAt,
      articleText(article.blocks),
    ],
  );

  return {
    id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    author: article.author,
    site: article.site,
    blocks: article.blocks,
    scrapedAt: article.scrapedAt,
    publishedAt: article.publishedAt,
    saved: true,
    // Re-fetching keeps the reading position and archive state.
    progress: existing?.progress ?? 0,
    archived: existing?.archived ?? false,
  };
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM articles WHERE id = $1", [id]);
}

// Chats, highlights and messages (M5). One chat per article, which maps to
// one ACP session; `acp_session_id` is kept so the session can be resumed
// after a restart.

export async function getChatForArticle(
  articleId: string,
): Promise<Chat | null> {
  const db = await getDb();
  const rows = await db.select<
    { id: string; article_id: string; acp_session_id: string | null }[]
  >("SELECT * FROM chats WHERE article_id = $1 LIMIT 1", [articleId]);
  const row = rows[0];
  return row
    ? {
        id: row.id,
        articleId: row.article_id,
        acpSessionId: row.acp_session_id,
      }
    : null;
}

export async function createChat(articleId: string): Promise<Chat> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO chats (id, article_id, agent, acp_session_id, created_at) VALUES ($1, $2, 'codex', NULL, $3)",
    [id, articleId, Date.now()],
  );
  return { id, articleId, acpSessionId: null };
}

export async function setChatSession(
  chatId: string,
  acpSessionId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE chats SET acp_session_id = $1 WHERE id = $2", [
    acpSessionId,
    chatId,
  ]);
}

export async function addHighlight(
  highlight: Omit<Highlight, "id">,
): Promise<Highlight> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO highlights (id, article_id, block_index, start_offset, end_offset, text, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      highlight.articleId,
      highlight.blockIndex,
      highlight.startOffset,
      highlight.endOffset,
      highlight.text,
      Date.now(),
    ],
  );
  return { id, ...highlight };
}

export async function addMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
  highlightId: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO messages (id, chat_id, highlight_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [crypto.randomUUID(), chatId, highlightId, role, content, Date.now()],
  );
}

export async function listMessages(chatId: string): Promise<StoredMessage[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      role: "user" | "assistant";
      content: string;
      h_id: string | null;
      article_id: string | null;
      block_index: number | null;
      start_offset: number | null;
      end_offset: number | null;
      h_text: string | null;
    }[]
  >(
    `SELECT m.id, m.role, m.content, h.id AS h_id, h.article_id, h.block_index,
            h.start_offset, h.end_offset, h.text AS h_text
     FROM messages m LEFT JOIN highlights h ON h.id = m.highlight_id
     WHERE m.chat_id = $1 ORDER BY m.created_at, m.rowid`,
    [chatId],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    highlight: r.h_id
      ? {
          id: r.h_id,
          articleId: r.article_id!,
          blockIndex: r.block_index!,
          startOffset: r.start_offset!,
          endOffset: r.end_offset!,
          text: r.h_text!,
        }
      : null,
  }));
}

export async function listHighlights(articleId: string): Promise<Highlight[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      article_id: string;
      block_index: number;
      start_offset: number;
      end_offset: number;
      text: string;
    }[]
  >("SELECT * FROM highlights WHERE article_id = $1 ORDER BY created_at", [
    articleId,
  ]);
  return rows.map((r) => ({
    id: r.id,
    articleId: r.article_id,
    blockIndex: r.block_index,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
  }));
}

/** Removes the newest assistant message (used when regenerating it). */
export async function deleteLastAssistantMessage(
  chatId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM messages WHERE id = (
       SELECT id FROM messages WHERE chat_id = $1 AND role = 'assistant'
       ORDER BY created_at DESC, rowid DESC LIMIT 1)`,
    [chatId],
  );
}

// ---- Library: search, progress, archive, tags (migration 2) ----

/** Fills `text_content` for articles saved before search existed. The
 * update triggers then index them. Cheap no-op once everything is done. */
export async function backfillSearchText(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: string; blocks_json: string }[]>(
    "SELECT id, blocks_json FROM articles WHERE text_content IS NULL",
  );
  for (const row of rows) {
    await db.execute("UPDATE articles SET text_content = $1 WHERE id = $2", [
      articleText(JSON.parse(row.blocks_json) as Block[]),
      row.id,
    ]);
  }
}

/** Turns free text into a safe FTS5 query: every word must match, as a
 * prefix. Quoting each token means user input can never be parsed as FTS
 * syntax (AND/OR/NEAR, column filters, stray quotes). */
export function toMatchQuery(input: string): string | null {
  const tokens = input.match(/[\p{L}\p{N}_]+/gu);
  return tokens ? tokens.map((t) => `"${t}"*`).join(" ") : null;
}

/** Best match per article, across article text and chat messages. */
export async function searchLibrary(input: string): Promise<SearchHit[]> {
  const match = toMatchQuery(input);
  if (!match) return [];
  const db = await getDb();
  const rows = await db.select<
    { article_id: string; kind: "article" | "chat"; snip: string }[]
  >(
    `SELECT article_id, kind, snippet(search_index, 3, char(1), char(2), '…', 14) AS snip
     FROM search_index WHERE search_index MATCH $1 ORDER BY rank LIMIT 80`,
    [match],
  );
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (seen.has(row.article_id)) continue;
    seen.add(row.article_id);
    hits.push({
      articleId: row.article_id,
      kind: row.kind,
      snippet: row.snip,
    });
  }
  return hits;
}

/** Match markers from an FTS5 snippet (see toMatchQuery/searchLibrary),
 * for a caller (a prompt) that wants plain text rather than the UI's
 * bold-the-matches rendering. */
function stripMatchMarkers(snippet: string): string {
  return snippet.split("\u0001").join("").split("\u0002").join("");
}

// Short/filler words that would dilute an OR query across many unrelated
// documents — not a full stopword list, just cheap noise reduction.
const NOISE_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "as",
  "by",
  "at",
  "from",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "you",
  "your",
  "can",
  "not",
  "no",
  "if",
  "when",
  "then",
  "so",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "there",
  "here",
]);

/**
 * An FTS5 query matching ANY of a passage's more distinctive words, unlike
 * `toMatchQuery`'s "every word must match." `toMatchQuery` suits a short,
 * precise search someone typed; here the "query" is a whole highlighted
 * passage or question, where requiring every word to appear in another
 * document would almost never match anything. Deduplicated, short/filler
 * words dropped, capped so a long passage doesn't build an unwieldy query.
 */
export function toRelatedQuery(text: string, maxTerms = 12): string | null {
  const tokens = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (key.length < 4 || NOISE_WORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    terms.push(`"${token}"*`);
    if (terms.length >= maxTerms) break;
  }
  return terms.length > 0 ? terms.join(" OR ") : null;
}

/** Other saved articles whose text matches `queryText`, for cross-article
 * context in a prompt (see lib/prompt.ts's `relatedArticles` option).
 * Reuses the same full-text index and safe-query builder as
 * `searchLibrary`, restricted to article bodies (not chat messages — a
 * stranger article's old Q&A isn't relevant context here) and excluding
 * the article currently open. */
export async function relatedArticles(
  excludeArticleId: string,
  queryText: string,
  limit = 3,
): Promise<RelatedArticle[]> {
  const match = toRelatedQuery(queryText);
  if (!match) return [];
  const db = await getDb();
  const rows = await db.select<
    { article_id: string; title: string | null; snip: string }[]
  >(
    `SELECT si.article_id, a.title,
            snippet(search_index, 3, char(1), char(2), '…', 16) AS snip
     FROM search_index si
     JOIN articles a ON a.id = si.article_id
     WHERE search_index MATCH $1 AND si.kind = 'article' AND si.article_id != $2
     ORDER BY rank
     LIMIT $3`,
    [match, excludeArticleId, limit],
  );
  return rows.map((row) => ({
    articleId: row.article_id,
    title: row.title ?? "Untitled",
    snippet: stripMatchMarkers(row.snip),
  }));
}

export async function setArticleProgress(
  id: string,
  progress: number,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET progress = $1 WHERE id = $2", [
    Math.min(1, Math.max(0, progress)),
    id,
  ]);
}

export async function setArticleArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET archived = $1 WHERE id = $2", [
    archived ? 1 : 0,
    id,
  ]);
}

export { normalizeTag };

export async function addArticleTag(id: string, raw: string): Promise<void> {
  const tag = normalizeTag(raw);
  if (!tag) return;
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES ($1, $2)",
    [id, tag],
  );
}

export async function removeArticleTag(id: string, tag: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM article_tags WHERE article_id = $1 AND tag = $2",
    [id, tag],
  );
}

// ---- Offline image cache index (migration 3) ----

/** url -> cached file name, for one article. */
export async function getArticleImages(
  articleId: string,
): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ url: string; file: string }[]>(
    "SELECT url, file FROM article_images WHERE article_id = $1",
    [articleId],
  );
  return Object.fromEntries(rows.map((r) => [r.url, r.file]));
}

export async function saveArticleImages(
  articleId: string,
  images: { url: string; file: string }[],
): Promise<void> {
  const db = await getDb();
  for (const { url, file } of images) {
    await db.execute(
      "INSERT OR REPLACE INTO article_images (article_id, url, file) VALUES ($1, $2, $3)",
      [articleId, url, file],
    );
  }
}

/** Every cached file some article still uses (everything else can be pruned). */
export async function listUsedImageFiles(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ file: string }[]>(
    "SELECT DISTINCT file FROM article_images",
  );
  return rows.map((r) => r.file);
}

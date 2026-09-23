import Database from "@tauri-apps/plugin-sql";
import type { Block } from "@/types/article";
import type { ArticleSummary, StoredArticle } from "@/types/library";
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
  saved: number;
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
    saved: row.saved === 1,
  };
}

export async function listArticles(): Promise<ArticleSummary[]> {
  const db = await getDb();
  const rows = await db.select<
    Pick<
      ArticleRow,
      | "id"
      | "url"
      | "canonical_url"
      | "title"
      | "author"
      | "site"
      | "scraped_at"
    >[]
  >(
    "SELECT id, url, canonical_url, title, author, site, scraped_at FROM articles ORDER BY scraped_at DESC",
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? row.site ?? row.url,
    author: row.author,
    site: row.site ?? "",
    canonicalUrl: row.canonical_url,
    scrapedAt: row.scraped_at,
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
    `INSERT INTO articles (id, url, canonical_url, title, author, site, blocks_json, scraped_at, saved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
     ON CONFLICT(canonical_url) DO UPDATE SET
       url = excluded.url,
       title = excluded.title,
       author = excluded.author,
       site = excluded.site,
       blocks_json = excluded.blocks_json,
       scraped_at = excluded.scraped_at`,
    [
      id,
      article.url,
      article.canonicalUrl,
      article.title,
      article.author,
      article.site,
      blocksJson,
      article.scrapedAt,
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
    saved: true,
  };
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM articles WHERE id = $1", [id]);
}

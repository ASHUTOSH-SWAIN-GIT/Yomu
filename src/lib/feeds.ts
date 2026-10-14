/** A post in a blog's feed (see src-tauri/src/scraper/feed.rs). */
export interface FeedEntry {
  url: string;
  title: string;
  /** Unix millis. */
  publishedAt: number | null;
}

/** What reading a blog's feed found; entries come newest first. */
export interface FoundFeed {
  feedUrl: string;
  siteUrl: string | null;
  title: string;
  entries: FeedEntry[];
}

/** A blog the reader is subscribed to. */
export interface Feed {
  id: string;
  feedUrl: string;
  siteUrl: string | null;
  title: string;
  addedAt: number;
  lastChecked: number | null;
}

/** Most posts saved from one blog in one pass, so a blog that published a
 * lot at once never holds the app up. */
export const PER_FEED_PASS = 5;
export const EVERY_MS = 30 * 60_000;
/** A blog checked more recently than this is skipped, so reopening the app
 * does not ask every blog again. */
export const MIN_GAP_MS = 25 * 60_000;

/** Of the posts not seen before, the newest `limit` to save; the rest are
 * only noted, so they are never offered later. */
export function planImport(
  entries: FeedEntry[],
  seen: Set<string>,
  limit: number,
): { take: FeedEntry[]; skip: FeedEntry[] } {
  const fresh = new Map<string, FeedEntry>();
  for (const e of entries) if (!seen.has(e.url)) fresh.set(e.url, e);
  const all = [...fresh.values()];
  return { take: all.slice(0, limit), skip: all.slice(limit) };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The subscribed blog an article belongs to, by the host of the blog's site
 * (or of its feed). */
export function feedForHost(feeds: Feed[], articleUrl: string): Feed | null {
  const host = hostOf(articleUrl);
  if (!host) return null;
  return (
    feeds.find(
      (f) =>
        (f.siteUrl && hostOf(f.siteUrl) === host) || hostOf(f.feedUrl) === host,
    ) ?? null
  );
}

import { canonicalizeUrl, scrapeUrl } from "@/lib/commands";
import { getArticleByCanonicalUrl, setInbox, upsertArticle } from "@/lib/db";

/** Saves a page into the Inbox, in no collection: the reader files it, and
 * that is what takes it out of the Inbox. A page already in the library is
 * left where it is: it is not new to the reader. `added` says whether the
 * page was new. */
export async function saveToInbox(
  url: string,
): Promise<{ id: string; added: boolean }> {
  const canonical = await canonicalizeUrl(url);
  const existing = await getArticleByCanonicalUrl(canonical);
  if (existing) return { id: existing.id, added: false };
  const saved = await upsertArticle(await scrapeUrl(url));
  await setInbox(saved.id, true);
  return { id: saved.id, added: true };
}

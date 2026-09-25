import type { ArticleSummary } from "@/types/library";

/**
 * Spaces are tags with a name, a colour and a place in the sidebar.
 * Articles with no tag live in the Inbox. An article can be in several
 * spaces (it has several tags). Colours: one of 8 slots (--sp-0..7 in
 * index.css) per space; the Inbox has its own neutral colour.
 */
export const INBOX = "inbox";
export const SPACE_SLOTS = 8;

export interface SpaceInfo {
  /** The tag, or INBOX. */
  id: string;
  name: string;
  count: number;
  /** Colour slot 0..7, or null for the Inbox. */
  slot: number | null;
}

// Short names people write in capitals ("AI", "SQL"), not "Ai".
const ACRONYMS = new Set([
  "ai",
  "ml",
  "llm",
  "ui",
  "ux",
  "api",
  "css",
  "html",
  "sql",
  "os",
  "db",
  "ci",
  "cd",
  "seo",
  "gpu",
  "cpu",
  "http",
  "aws",
  "gcp",
  "cli",
  "sdk",
]);

/** "reading-list" becomes "Reading list"; known acronyms are upper-cased. */
export function displaySpaceName(id: string): string {
  if (id === INBOX) return "Inbox";
  if (ACRONYMS.has(id)) return id.toUpperCase();
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Keeps every existing valid slot and gives each new name the lowest unused
 * slot (or, once all 8 are taken, the least used one). Colours therefore
 * never shift when spaces are added or removed.
 */
export function assignSlots(
  names: string[],
  existing: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  const uses = new Array<number>(SPACE_SLOTS).fill(0);
  for (const name of names) {
    const slot = existing[name];
    if (Number.isInteger(slot) && slot >= 0 && slot < SPACE_SLOTS) {
      result[name] = slot;
      uses[slot] += 1;
    }
  }
  for (const name of names) {
    if (name in result) continue;
    const least = Math.min(...uses);
    const slot = uses.indexOf(least);
    result[name] = slot;
    uses[slot] += 1;
  }
  return result;
}

/** Active (not archived) articles in a space. */
export function articlesInSpace(
  articles: ArticleSummary[],
  spaceId: string,
): ArticleSummary[] {
  return articles.filter(
    (a) =>
      !a.archived &&
      (spaceId === INBOX ? a.tags.length === 0 : a.tags.includes(spaceId)),
  );
}

/** Every space, for the sidebar: the Inbox first (only if it has articles or
 * is the active space), then spaces by size and name. `extra` are spaces
 * created but not yet holding an article. */
export function buildSpaces(
  articles: ArticleSummary[],
  extra: string[],
  slots: Record<string, number>,
  active: string,
): SpaceInfo[] {
  const names = new Set<string>(extra);
  for (const a of articles) {
    if (!a.archived) for (const t of a.tags) names.add(t);
  }
  const spaces = [...names]
    .map((id) => ({
      id,
      name: displaySpaceName(id),
      count: articlesInSpace(articles, id).length,
      slot: slots[id] ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const inboxCount = articlesInSpace(articles, INBOX).length;
  const inbox: SpaceInfo[] =
    inboxCount > 0 || active === INBOX
      ? [{ id: INBOX, name: "Inbox", count: inboxCount, slot: null }]
      : [];
  return [...inbox, ...spaces];
}

/** Which space an open article "is in" for colour and context: the active
 * space if the article belongs to it, otherwise its first tag, otherwise
 * the Inbox. */
export function spaceOfArticle(
  article: Pick<ArticleSummary, "tags">,
  active: string,
): string {
  if (active !== INBOX && article.tags.includes(active)) return active;
  return article.tags[0] ?? INBOX;
}

/** Colour slot for a space id (null = Inbox / unknown, i.e. neutral). */
export function slotOf(
  spaceId: string,
  slots: Record<string, number>,
): number | null {
  return spaceId === INBOX ? null : (slots[spaceId] ?? null);
}

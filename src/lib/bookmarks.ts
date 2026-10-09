import type { BookmarkImport } from "@/lib/db";

/** The folder to bookmark pages into. */
export const BOOKMARK_FOLDER = "Yomu";
/** A page that could not be fetched is tried this many times, then left. */
export const MAX_TRIES = 3;

/** A page found in a browser's bookmarks folder (see src-tauri/src/bookmarks.rs). */
export interface BookmarkLink {
  url: string;
  title: string;
  browser: string;
  /** When it was bookmarked, in milliseconds, if the browser says. */
  added: number | null;
}

/** What was found for one browser. */
export interface BrowserStatus {
  name: string;
  found: boolean;
  hasFolder: boolean;
}

export interface BookmarkScan {
  links: BookmarkLink[];
  browsers: BrowserStatus[];
}

/** The pages still to save: new ones, and ones that failed fewer than
 * `MAX_TRIES` times. Newest bookmark first (those with no date last), so what
 * was just bookmarked is ready first. */
export function pendingLinks(
  links: BookmarkLink[],
  tried: Map<string, BookmarkImport>,
): BookmarkLink[] {
  return links
    .filter((link) => {
      const before = tried.get(link.url);
      return (
        !before || (before.status === "failed" && before.tries < MAX_TRIES)
      );
    })
    .sort((a, b) => (b.added ?? -1) - (a.added ?? -1));
}

import { create } from "zustand";
import {
  BOOKMARK_FOLDER,
  pendingLinks,
  type BrowserStatus,
} from "@/lib/bookmarks";
import { canonicalizeUrl, scanBookmarks, scrapeUrl } from "@/lib/commands";
import { saveToDefaultCollection } from "@/lib/default-collection";
import {
  getArticleByCanonicalUrl,
  listBookmarkImports,
  recordBookmarkImport,
  setInbox,
  upsertArticle,
} from "@/lib/db";
import { logError } from "@/lib/log";
import { readStorage, writeStorage } from "@/lib/storage";
import { useLibraryStore } from "@/stores/library-store";

const ENABLED_KEY = "yomu-bookmarks";
/** Most pages saved in one pass, so a first scan of a big folder is spread
 * over the next passes and never holds the app up. */
const PER_PASS = 20;
const EVERY_MS = 60_000;

interface BookmarksStore {
  /** Pages in the browsers' Yomu folder are saved on their own. */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** What was found for each browser, as of the last pass. */
  browsers: BrowserStatus[];
  checking: boolean;
  lastChecked: number | null;
  /** Pages saved since the app opened. */
  saved: number;
  /** Pages found but not saved yet. */
  waiting: number;
  /** Looks at the browsers and saves what is new. */
  check: () => Promise<void>;
}

/** Saves one bookmarked page into the Inbox. A page already in the library is
 * left where it is: it is not new to the reader. Returns the saved article's
 * id. */
async function saveBookmarked(url: string): Promise<string> {
  const canonical = await canonicalizeUrl(url);
  const existing = await getArticleByCanonicalUrl(canonical);
  if (existing) return existing.id;
  const saved = await upsertArticle(await scrapeUrl(url));
  await setInbox(saved.id, true);
  // A failure to file it must not lose the page that was just saved.
  await saveToDefaultCollection(saved.id).catch((err) =>
    logError("filing a bookmarked page failed", err),
  );
  return saved.id;
}

let running = false;

export const useBookmarksStore = create<BookmarksStore>((set, get) => ({
  enabled: readStorage(ENABLED_KEY) !== "0",
  setEnabled(enabled) {
    writeStorage(ENABLED_KEY, enabled ? "1" : "0");
    set({ enabled });
    if (enabled) void get().check();
  },
  browsers: [],
  checking: false,
  lastChecked: null,
  saved: 0,
  waiting: 0,

  async check() {
    if (running || !get().enabled) return;
    running = true;
    set({ checking: true });
    try {
      const scan = await scanBookmarks(BOOKMARK_FOLDER);
      const todo = pendingLinks(scan.links, await listBookmarkImports());
      set({ browsers: scan.browsers, waiting: todo.length });

      let saved = 0;
      for (const link of todo.slice(0, PER_PASS)) {
        try {
          const id = await saveBookmarked(link.url);
          await recordBookmarkImport(link.url, "saved", id);
          saved += 1;
        } catch (err) {
          logError(`saving the bookmarked page ${link.url} failed`, err);
          await recordBookmarkImport(link.url, "failed", null).catch(() => {});
        }
      }
      if (saved > 0) await useLibraryStore.getState().refresh();
      set((s) => ({
        saved: s.saved + saved,
        waiting: Math.max(0, todo.length - PER_PASS),
      }));
    } catch (err) {
      logError("checking the browsers' bookmarks failed", err);
    } finally {
      running = false;
      set({ checking: false, lastChecked: Date.now() });
    }
  },
}));

/** Checks now, every minute, and whenever the window is brought back: so a
 * page bookmarked while Yomu was closed is there when it opens, and one
 * bookmarked while it is open shows up shortly. Returns how to stop. */
export function watchBookmarks(): () => void {
  const check = () => void useBookmarksStore.getState().check();
  check();
  const timer = setInterval(check, EVERY_MS);
  window.addEventListener("focus", check);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", check);
  };
}

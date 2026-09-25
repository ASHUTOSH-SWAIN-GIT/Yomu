import { create } from "zustand";
import { canonicalizeUrl, scrapeUrl } from "@/lib/commands";
import {
  getArticleByCanonicalUrl,
  getArticleById,
  upsertArticle,
} from "@/lib/db";
import { logError } from "@/lib/log";
import { useLibraryStore } from "@/stores/library-store";
import type { StoredArticle } from "@/types/library";

export type ReaderState =
  | { status: "empty" }
  | { status: "loading"; url: string }
  | { status: "error"; url: string; message: string }
  | { status: "ready"; article: StoredArticle };

interface ReaderStore {
  state: ReaderState;
  /** Opens a pasted URL: serves it from the library if already saved
   * (no network), otherwise scrapes it and saves the result. */
  openUrl: (url: string) => Promise<void>;
  /** Re-fetches an open article and replaces its saved content (same id,
   * so its chat is kept). Upgrades articles saved by an older scraper. */
  rescrape: (article: StoredArticle) => Promise<void>;
  /** Back to the empty state (a new tab, or the open article was closed). */
  reset: () => void;
  /** Opens an already saved article directly from the library, by id. */
  openArticle: (id: string) => Promise<void>;
}

export const useReaderStore = create<ReaderStore>((set) => ({
  state: { status: "empty" },

  async openUrl(url) {
    set({ state: { status: "loading", url } });
    try {
      const canonicalUrl = await canonicalizeUrl(url);
      const cached = await getArticleByCanonicalUrl(canonicalUrl);
      if (cached) {
        set({ state: { status: "ready", article: cached } });
        return;
      }

      const scraped = await scrapeUrl(url);
      const saved = await upsertArticle(scraped);
      set({ state: { status: "ready", article: saved } });
      await useLibraryStore.getState().refresh();
    } catch (err) {
      logError(`opening ${url} failed`, err);
      set({
        state: {
          status: "error",
          url,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  async rescrape(article) {
    try {
      const saved = await upsertArticle(await scrapeUrl(article.url));
      set({ state: { status: "ready", article: saved } });
      await useLibraryStore.getState().refresh();
    } catch (err) {
      logError(`re-scrape of ${article.url} failed`, err);
      set({
        state: {
          status: "error",
          url: article.url,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  reset() {
    set({ state: { status: "empty" } });
  },

  async openArticle(id) {
    const article = await getArticleById(id);
    if (article) {
      set({ state: { status: "ready", article } });
    }
  },
}));

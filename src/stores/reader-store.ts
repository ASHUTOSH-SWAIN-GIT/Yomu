import { createStore } from "zustand";
import { canonicalizeUrl, scrapeUrl } from "@/lib/commands";
import {
  getArticleByCanonicalUrl,
  getArticleById,
  upsertArticle,
} from "@/lib/db";
import { saveToDefaultCollection } from "@/lib/default-collection";
import { logError } from "@/lib/log";
import { addPaper } from "@/lib/pdf/add";
import { baseName, isPdfUrl } from "@/lib/pdf/identity";
import { reimportPdf } from "@/lib/pdf/import";
import { useLibraryStore } from "@/stores/library-store";
import { registerPart, tabStore } from "@/stores/tabs";
import type { StoredArticle } from "@/types/library";

export type ReaderState =
  | { status: "empty" }
  | {
      status: "loading";
      url: string;
      detail?: string;
      /** How far along, 0 to 1, when that is known (a PDF's pages). */
      fraction?: number;
    }
  | { status: "error"; url: string; message: string }
  | { status: "ready"; article: StoredArticle };

export interface ReaderStore {
  state: ReaderState;
  /** Opens a pasted URL: serves it from the library if already saved
   * (no network), otherwise scrapes it and saves the result. */
  openUrl: (url: string) => Promise<void>;
  /** Opens a PDF from this computer: copies it into Yomu's folder, reads it
   * into an article and saves it (or opens the saved copy if it is already
   * in the library). */
  openPdf: (path: string) => Promise<void>;
  /** Re-fetches an open article and replaces its saved content (same id,
   * so its chat is kept). Upgrades articles saved by an older scraper. */
  rescrape: (article: StoredArticle) => Promise<void>;
  /** Back to the empty state (a new tab, or the open article was closed). */
  reset: () => void;
  /** Opens an already saved article directly from the library, by id. */
  openArticle: (id: string) => Promise<void>;
}

registerPart("reader", () =>
  createStore<ReaderStore>((set) => ({
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
        // A failure to file it must not lose the blog that was just saved.
        await saveToDefaultCollection(saved.id).catch((err) =>
          logError("saving to the default collection failed", err),
        );
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

    async openPdf(path) {
      const name = baseName(path);
      set({ state: { status: "loading", url: name, detail: "Opening…" } });
      try {
        const { article } = await addPaper(path, (p) =>
          set({
            state: {
              status: "loading",
              url: name,
              detail: `Reading page ${p.page} of ${p.pages}…`,
              fraction: p.page / p.pages,
            },
          }),
        );
        set({ state: { status: "ready", article } });
      } catch (err) {
        logError(`opening ${path} failed`, err);
        set({
          state: {
            status: "error",
            url: path,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },

    async rescrape(article) {
      try {
        const fresh = isPdfUrl(article.canonicalUrl)
          ? await reimportPdf(article)
          : await scrapeUrl(article.url);
        const saved = await upsertArticle(fresh);
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
  })),
);

export const useReaderStore = tabStore("reader");

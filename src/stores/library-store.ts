import { create } from "zustand";
import {
  addArticleTag,
  backfillSearchText,
  deleteArticle,
  listArticles,
  listUsedImageFiles,
  removeArticleTag,
  setArticleArchived,
} from "@/lib/db";
import { pruneImages } from "@/lib/commands";
import { logError } from "@/lib/log";
import type { ArticleSummary } from "@/types/library";

interface LibraryStore {
  articles: ArticleSummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  addTag: (id: string, tag: string) => Promise<void>;
  removeTag: (id: string, tag: string) => Promise<void>;
  /** Updates one row in memory (e.g. reading progress) without a refetch. */
  patch: (id: string, patch: Partial<ArticleSummary>) => void;
}

let backfilled = false;
export const useLibraryStore = create<LibraryStore>((set, get) => ({
  articles: [],
  loaded: false,

  async refresh() {
    if (!backfilled) {
      backfilled = true;
      // Index articles saved before full-text search existed.
      await backfillSearchText().catch((err) =>
        logError("search backfill failed", err),
      );
    }
    const articles = await listArticles();
    set({ articles, loaded: true });
  },

  async remove(id) {
    await deleteArticle(id);
    // Free the cached images nothing else uses (rows cascade with the article).
    try {
      await pruneImages(await listUsedImageFiles());
    } catch (err) {
      logError("pruning cached images failed", err);
    }
    // Refetch rather than filter locally, so the list stays correct even
    // if something else changed the table in the meantime.
    await get().refresh();
  },

  async setArchived(id, archived) {
    get().patch(id, { archived });
    await setArticleArchived(id, archived);
  },

  async addTag(id, tag) {
    await addArticleTag(id, tag);
    await get().refresh();
  },

  async removeTag(id, tag) {
    await removeArticleTag(id, tag);
    await get().refresh();
  },

  patch(id, patch) {
    set((s) => ({
      articles: s.articles.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  },
}));

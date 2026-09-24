import { create } from "zustand";
import {
  addArticleTag,
  backfillSearchText,
  deleteArticle,
  listArticles,
  removeArticleTag,
  searchLibrary,
  setArticleArchived,
} from "@/lib/db";
import { logError } from "@/lib/log";
import type { ArticleSummary, SearchHit } from "@/types/library";

export type LibraryView = "active" | "archived";

interface LibraryStore {
  articles: ArticleSummary[];
  loaded: boolean;
  view: LibraryView;
  /** Only show articles with this tag. */
  tagFilter: string | null;
  /** Full-text hits for the current query; null when not searching. */
  hits: SearchHit[] | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  setView: (view: LibraryView) => void;
  setTagFilter: (tag: string | null) => void;
  search: (query: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  addTag: (id: string, tag: string) => Promise<void>;
  removeTag: (id: string, tag: string) => Promise<void>;
  /** Updates one row in memory (e.g. reading progress) without a refetch. */
  patch: (id: string, patch: Partial<ArticleSummary>) => void;
}

let backfilled = false;
// Guards against a slow, older search overwriting a newer one.
let searchSeq = 0;

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  articles: [],
  loaded: false,
  view: "active",
  tagFilter: null,
  hits: null,

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
    // Refetch rather than filter locally, so the list stays correct even
    // if something else changed the table in the meantime.
    await get().refresh();
  },

  setView: (view) => set({ view, tagFilter: null }),
  setTagFilter: (tagFilter) => set({ tagFilter }),

  async search(query) {
    const seq = ++searchSeq;
    if (!query.trim()) {
      set({ hits: null });
      return;
    }
    try {
      const hits = await searchLibrary(query);
      if (seq === searchSeq) set({ hits });
    } catch (err) {
      logError("search failed", err);
      if (seq === searchSeq) set({ hits: [] });
    }
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

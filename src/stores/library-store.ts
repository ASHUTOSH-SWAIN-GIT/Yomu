import { create } from "zustand";
import { deleteArticle, listArticles } from "@/lib/db";
import type { ArticleSummary } from "@/types/library";

interface LibraryStore {
  articles: ArticleSummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  articles: [],
  loaded: false,
  async refresh() {
    const articles = await listArticles();
    set({ articles, loaded: true });
  },
  async remove(id) {
    await deleteArticle(id);
    // Refetch rather than filter locally, so the list stays correct even
    // if something else changed the table in the meantime.
    await get().refresh();
  },
}));

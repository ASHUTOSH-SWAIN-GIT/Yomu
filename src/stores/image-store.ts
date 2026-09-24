import { create } from "zustand";
import { cacheImages, imageCacheDir } from "@/lib/commands";
import { getArticleImages, saveArticleImages } from "@/lib/db";
import { imageUrlsOf } from "@/lib/images";
import { logError } from "@/lib/log";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";
import type { StoredArticle } from "@/types/library";

interface ImageStore {
  /** Folder holding cached images (absolute), once known. */
  dir: string | null;
  /** For the open article: image URL -> cached file name. */
  files: Record<string, string>;
  articleId: string | null;
  /** True once `files` reflects the database for the open article. Until
   * then images must not render, or a cached article would briefly hit
   * the remote hosts anyway. */
  loaded: boolean;
  /** Loads the open article's cached images, then downloads any missing ones. */
  sync: (article: StoredArticle | null) => Promise<void>;
}

export const useImageStore = create<ImageStore>((set, get) => ({
  dir: null,
  files: {},
  articleId: null,
  loaded: false,

  async sync(article) {
    if (!article) {
      set({ articleId: null, files: {}, loaded: false });
      return;
    }
    set({ articleId: article.id, files: {}, loaded: false });
    const stale = () => get().articleId !== article.id;

    try {
      const [dir, known] = await Promise.all([
        get().dir ?? imageCacheDir(),
        getArticleImages(article.id),
      ]);
      if (stale()) return;
      set({ dir, files: known, loaded: true });

      // Blocking remote images also means not fetching them ourselves.
      if (useUiStore.getState().blockRemoteImages) return;
      const missing = imageUrlsOf(article).filter((url) => !known[url]);
      if (missing.length === 0) return;

      const names = await cacheImages(missing);
      if (stale()) return;
      const saved = missing.flatMap((url, i) =>
        names[i] ? [{ url, file: names[i] as string }] : [],
      );
      if (saved.length === 0) return;
      await saveArticleImages(article.id, saved);
      if (stale()) return;
      set((s) => ({
        files: {
          ...s.files,
          ...Object.fromEntries(saved.map((x) => [x.url, x.file])),
        },
      }));
    } catch (err) {
      // Offline reading is an enhancement: never break the reader over it.
      logError("caching images failed", err);
      // Fall back to showing remote images rather than none at all.
      if (!stale()) set({ loaded: true });
    }
  },
}));

// Follow the open article; a re-fetch swaps the article object, so this
// also picks up images added by a newer scrape.
useReaderStore.subscribe((state, prev) => {
  const article = state.state.status === "ready" ? state.state.article : null;
  const before = prev.state.status === "ready" ? prev.state.article : null;
  if (article !== before) void useImageStore.getState().sync(article);
});

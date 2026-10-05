import { addArticleTag } from "@/lib/db";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** The collection a first blog lands in when the user has made none. */
export const DEFAULT_COLLECTION = "collection";

/** Puts a freshly saved blog in the default collection: always when the
 * user has no collections yet (which creates it), and afterwards as long as
 * it still exists. A user who has their own collections and no default is
 * left alone. */
export async function saveToDefaultCollection(articleId: string) {
  const names = new Set([
    ...useSpacesStore.getState().extra,
    ...useLibraryStore
      .getState()
      .articles.filter((a) => !a.archived)
      .flatMap((a) => a.tags),
  ]);
  if (names.size > 0 && !names.has(DEFAULT_COLLECTION)) return;
  await addArticleTag(articleId, DEFAULT_COLLECTION);
}

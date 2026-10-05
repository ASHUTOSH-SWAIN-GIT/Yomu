import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** Deletes a collection. Its blogs are kept: they only lose the tag, and
 * stay in Home. */
export async function removeCollection(id: string) {
  const { articles, removeTag } = useLibraryStore.getState();
  await Promise.all(
    articles.filter((a) => a.tags.includes(id)).map((a) => removeTag(a.id, id)),
  );
  useSpacesStore.getState().deleteSpace(id);
}

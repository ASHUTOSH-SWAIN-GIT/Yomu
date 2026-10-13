import { useLibraryStore } from "@/stores/library-store";
import { normalizeTag } from "@/lib/tags";
import { INBOX } from "@/lib/spaces";
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

/** Moves a blog from one collection to another (a drag in the sidebar). It
 * joins the new one before leaving the old, so it is never left out of
 * both. Returns false, changing nothing, when there is nowhere to move. */
export async function moveToCollection(
  articleId: string,
  from: string,
  to: string,
): Promise<boolean> {
  if (from === to || to === INBOX) return false;
  const { addTag, removeTag } = useLibraryStore.getState();
  await addTag(articleId, to);
  if (from !== INBOX) await removeTag(articleId, from);
  return true;
}

/** Renames a collection: its articles move to the new name, and it keeps
 * its colour. Returns the new id, or null when the name is empty or
 * unchanged. Renaming onto an existing collection merges the two. */
export async function renameCollection(
  id: string,
  name: string,
): Promise<string | null> {
  const next = normalizeTag(name);
  if (!next || next === id || next === INBOX) return null;
  const { articles, addTag, removeTag } = useLibraryStore.getState();
  for (const a of articles.filter((a) => a.tags.includes(id))) {
    await addTag(a.id, next);
    await removeTag(a.id, id);
  }
  useSpacesStore.getState().renameSpace(id, next);
  return next;
}

import { pruneImages } from "@/lib/commands";
import { deleteAllArticles, deleteAllChats } from "@/lib/db";
import { logError } from "@/lib/log";
import { writeStorage } from "@/lib/storage";
import { useChatStore } from "@/stores/chat-store";
import { useImageStore } from "@/stores/image-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** Deletes every chat. The blogs, collections and highlights-free reading
 * stay as they are. */
export async function clearAllChats() {
  await deleteAllChats();
  await useLibraryChatStore.getState().reset();
  // Reload the open blog's chat, which is now empty.
  const reader = useReaderStore.getState().state;
  await useChatStore
    .getState()
    .loadForArticle(reader.status === "ready" ? reader.article.id : null);
}

/** Deletes cached images (they are downloaded again when a blog is opened). */
export async function clearImageCache(): Promise<number> {
  const removed = await pruneImages([]);
  // Nothing is cached any more, so the open blog must not point at files.
  useImageStore.setState({ files: {} });
  return removed;
}

/** Deletes everything Yomu has saved: blogs, chats, collections, images. */
export async function deleteEverything() {
  await deleteAllArticles();
  try {
    await pruneImages([]);
  } catch (err) {
    logError("clearing the image cache failed", err);
  }
  useReaderStore.getState().reset();
  await useLibraryChatStore.getState().reset();
  await useChatStore.getState().loadForArticle(null);
  useImageStore.setState({ files: {} });
  useSpacesStore.getState().reset();
  writeStorage("yomu-sidebar-folded", "[]");
  await useLibraryStore.getState().refresh();
}

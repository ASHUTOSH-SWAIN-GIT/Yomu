import { pruneImages } from "@/lib/commands";
import { deleteAllArticles, deleteAllChats } from "@/lib/db";
import { logError } from "@/lib/log";
import { writeStorage } from "@/lib/storage";
import "@/stores/chat-store";
import "@/stores/image-store";
import "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { allBundles, partOf, resetTabs } from "@/stores/tabs";

/** Deletes every chat. The blogs, collections and highlights-free reading
 * stay as they are. */
export async function clearAllChats() {
  await deleteAllChats();
  for (const tab of allBundles()) {
    const libraryChat = partOf(tab, "libraryChat").getState();
    await libraryChat.reset();
    await libraryChat.loadChats();
    // Reload the open blog's chat, which is now empty.
    const reader = partOf(tab, "reader").getState().state;
    await partOf(tab, "chat")
      .getState()
      .loadForArticle(reader.status === "ready" ? reader.article.id : null);
  }
}

/** Deletes cached images (they are downloaded again when a blog is opened). */
export async function clearImageCache(): Promise<number> {
  const removed = await pruneImages([]);
  // Nothing is cached any more, so the open blog must not point at files.
  allBundles().forEach((tab) => partOf(tab, "images").setState({ files: {} }));
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
  // Every tab goes: what they showed is gone.
  resetTabs();
  useSpacesStore.getState().reset();
  writeStorage("yomu-sidebar-folded", "[]");
  await useLibraryStore.getState().refresh();
}

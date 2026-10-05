import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";

/** Switching articles while an answer streams would drop the rest of it, so
 * stop the answer first (its partial text is kept) and wait for it to end. */
async function settleStreaming() {
  if (!useChatStore.getState().streaming) return;
  await useChatStore.getState().stop();
  const deadline = Date.now() + 3000;
  while (useChatStore.getState().streaming && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Opens a saved article in the reader. */
export async function openSavedArticle(articleId: string) {
  await settleStreaming();
  await useReaderStore.getState().openArticle(articleId);
}

/** Back to the library page. */
export async function goHome() {
  await settleStreaming();
  useReaderStore.getState().reset();
}

/** Deletes an article; if it is the one being read, leaves for the library. */
export async function deleteArticle(articleId: string) {
  const reader = useReaderStore.getState().state;
  const reading = reader.status === "ready" && reader.article.id === articleId;
  await useLibraryStore.getState().remove(articleId);
  if (reading) await goHome();
}

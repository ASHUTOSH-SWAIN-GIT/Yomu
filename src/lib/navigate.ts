import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { openTab } from "@/stores/tabs";
import { useViewStore } from "@/stores/view-store";

/** Switching articles while an answer streams would drop the rest of it, so
 * stop the answer first (its partial text is kept) and wait for it to end. */
export async function settleStreaming() {
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

/** Brings the paragraph into view and flashes it, so the eye finds it. The
 * page may still be loading (and restoring where you left off), so it keeps
 * trying for a moment and settles once more after the layout does. */
function showParagraph(block: number) {
  let tries = 0;
  const find = () =>
    document.querySelector<HTMLElement>(
      `[data-tab-active="true"] [data-block-index="${block}"]`,
    );
  const attempt = () => {
    const el = find();
    if (!el) {
      if (++tries < 25) setTimeout(attempt, 120);
      return;
    }
    el.scrollIntoView({ block: "center" });
    el.classList.remove("source-flash");
    void el.offsetWidth; // so the animation can run again
    el.classList.add("source-flash");
    setTimeout(() => find()?.scrollIntoView({ block: "center" }), 350);
    setTimeout(() => el.classList.remove("source-flash"), 2400);
  };
  attempt();
}

/** Opens a saved article, at a paragraph when one is named (a source link in
 * an answer), in this tab or a new one. */
export async function openSource(
  articleId: string,
  block: number | null,
  inNewTab: boolean,
) {
  if (inNewTab) openTab();
  await openSavedArticle(articleId);
  if (block !== null) showParagraph(block);
}

/** Opens a saved article in a new tab. */
export function openArticleInNewTab(articleId: string) {
  openTab();
  void openSavedArticle(articleId);
}

/** Full screen for a blog's chat is a tab of its own: the blog opens in a
 * new tab with its chat filling the page. A reply still streaming here is
 * stopped first (its words so far are kept); the chat is saved, so the new
 * tab picks it up. */
export async function openChatFullInNewTab(articleId: string) {
  await settleStreaming();
  useViewStore.getState().setChatOpen(false);
  openTab();
  await openSavedArticle(articleId);
  const view = useViewStore.getState();
  view.setChatOpen(true);
  view.setChatFull(true);
}

/** Opens a saved chat in a new tab. */
export function openChatInNewTab(chatId: string) {
  openTab();
  useViewStore.getState().setLibraryChat(true);
  void useLibraryChatStore.getState().openChat(chatId);
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

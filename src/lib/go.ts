import { goHome } from "@/lib/navigate";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";

/** The pages of the app, for places that are not the sidebar (the command
 * palette). Each one leaves the open article for the page, the way the
 * sidebar does. */

function leaveArticle() {
  if (useReaderStore.getState().state.status === "ready") void goHome();
}

export function goToHome() {
  useViewStore.getState().showHome();
  void goHome();
}

export function goToPapers() {
  useViewStore.getState().setPapersPage(true);
  leaveArticle();
}

export function goToInbox() {
  useViewStore.getState().setShowInbox(true);
  leaveArticle();
}

export function goToArchive() {
  useViewStore.getState().setShowArchive(true);
  leaveArticle();
}

export function startNewChat() {
  void useLibraryChatStore.getState().reset();
  useViewStore.getState().setLibraryChat(true);
  leaveArticle();
}

export function openLibraryChat(id: string) {
  void useLibraryChatStore.getState().openChat(id);
  useViewStore.getState().setLibraryChat(true);
  leaveArticle();
}

/** The settings page, scrolled to one of its sections when one is named.
 * The page may take a moment to draw, so it tries for a short while. */
export function goToSettings(section?: string) {
  useViewStore.getState().setSettingsPage(true);
  leaveArticle();
  if (!section) return;
  let tries = 0;
  const scroll = () => {
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (++tries < 15) setTimeout(scroll, 80);
  };
  setTimeout(scroll, 80);
}

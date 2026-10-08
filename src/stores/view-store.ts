import { createStore } from "zustand";
import { registerPart, tabStore } from "@/stores/tabs";

/** What a tab shows besides a blog: which page, and the chat beside it.
 * Each tab has its own. */
export interface ViewStore {
  /** The universal chat page is open. */
  libraryChat: boolean;
  setLibraryChat: (on: boolean) => void;
  /** The settings page is open. */
  settingsPage: boolean;
  setSettingsPage: (on: boolean) => void;
  /** Home shows archived blogs instead of the active collection. */
  showArchive: boolean;
  setShowArchive: (on: boolean) => void;
  /** Back to plain Home. */
  showHome: () => void;
  /** The chat panel on the right of a blog. */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** The chat panel fills the whole page instead of sitting beside it. */
  chatFull: boolean;
  setChatFull: (full: boolean) => void;
  /** The blog's title has scrolled out of view (the top bar shows it). */
  pastTitle: boolean;
  setPastTitle: (past: boolean) => void;
}

registerPart("view", () =>
  createStore<ViewStore>((set) => ({
    libraryChat: false,
    setLibraryChat: (libraryChat) => set({ libraryChat, settingsPage: false }),
    settingsPage: false,
    setSettingsPage: (settingsPage) =>
      set({ settingsPage, libraryChat: false }),
    showArchive: false,
    setShowArchive: (showArchive) =>
      set({ showArchive, libraryChat: false, settingsPage: false }),
    showHome: () =>
      set({ showArchive: false, libraryChat: false, settingsPage: false }),
    chatOpen: false,
    setChatOpen: (chatOpen) => set({ chatOpen }),
    chatFull: false,
    setChatFull: (chatFull) => set({ chatFull }),
    pastTitle: false,
    setPastTitle: (pastTitle) => set({ pastTitle }),
  })),
);

export const useViewStore = tabStore("view");

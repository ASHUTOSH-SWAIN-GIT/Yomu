import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Don't fetch images from remote hosts (they can track the reader). */
  blockRemoteImages: boolean;
  setBlockRemoteImages: (block: boolean) => void;
  chatPanelOpen: boolean;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
}

const THEME_STORAGE_KEY = "yomu-theme";
const BLOCK_IMAGES_KEY = "yomu-block-images";

function readBlockImages(): boolean {
  try {
    return window.localStorage.getItem(BLOCK_IMAGES_KEY) === "1";
  } catch {
    return false;
  }
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export const useUiStore = create<UiState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    set({ theme });
  },
  blockRemoteImages: readBlockImages(),
  setBlockRemoteImages: (block) => {
    try {
      window.localStorage.setItem(BLOCK_IMAGES_KEY, block ? "1" : "0");
    } catch {
      // Storage unavailable: the setting just won't persist.
    }
    set({ blockRemoteImages: block });
  },
  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
}));

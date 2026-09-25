import { create } from "zustand";
import {
  DEFAULT_READER,
  READER_KEY,
  THEME_KEY,
  parseReaderPrefs,
  parseTheme,
  type ReaderPrefs,
  type Theme,
} from "@/lib/appearance";
import { readStorage as read, writeStorage as write } from "@/lib/storage";

export type { Theme } from "@/lib/appearance";

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Typeface, size and column width of the article. */
  reader: ReaderPrefs;
  setReader: (patch: Partial<ReaderPrefs>) => void;
  /** Hides everything except the article (Cmd/Ctrl+.). */
  focusMode: boolean;
  setFocusMode: (on: boolean) => void;
  /** Don't fetch images from remote hosts (they can track the reader). */
  blockRemoteImages: boolean;
  setBlockRemoteImages: (block: boolean) => void;
  /** The command palette (Cmd/Ctrl+K). */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** The spaces sidebar. Remembered; starts closed in a narrow window. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** The answer sheet above the Ask bar (Cmd/Ctrl+J). */
  answerOpen: boolean;
  setAnswerOpen: (open: boolean) => void;
  /** Which highlight's answer the sheet shows; null means the latest. */
  answerFocus: string | null;
  setAnswerFocus: (highlightId: string | null) => void;
  /** The Codex setup checklist dialog. */
  setupOpen: boolean;
  setSetupOpen: (open: boolean) => void;
}

const BLOCK_IMAGES_KEY = "yomu-block-images";
const SIDEBAR_KEY = "yomu-sidebar";

// Remembered choice, else open unless the window is narrow.
function initialSidebarOpen(): boolean {
  const saved = read(SIDEBAR_KEY);
  if (saved !== null) return saved === "1";
  return typeof window === "undefined" || window.innerWidth >= 900;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: parseTheme(read(THEME_KEY)),
  setTheme: (theme) => {
    write(THEME_KEY, theme);
    set({ theme });
  },
  reader: parseReaderPrefs(read(READER_KEY)),
  setReader: (patch) => {
    const reader = { ...DEFAULT_READER, ...get().reader, ...patch };
    write(READER_KEY, JSON.stringify(reader));
    set({ reader });
  },
  focusMode: false,
  setFocusMode: (focusMode) => set({ focusMode }),
  blockRemoteImages: read(BLOCK_IMAGES_KEY) === "1",
  setBlockRemoteImages: (block) => {
    write(BLOCK_IMAGES_KEY, block ? "1" : "0");
    set({ blockRemoteImages: block });
  },
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sidebarOpen: initialSidebarOpen(),
  setSidebarOpen: (sidebarOpen) => {
    write(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    set({ sidebarOpen });
  },
  answerOpen: false,
  setAnswerOpen: (answerOpen) => set({ answerOpen }),
  answerFocus: null,
  setAnswerFocus: (answerFocus) => set({ answerFocus }),
  setupOpen: false,
  setSetupOpen: (setupOpen) => set({ setupOpen }),
}));

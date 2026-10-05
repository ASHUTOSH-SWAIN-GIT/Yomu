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
import {
  DEFAULT_EXPLAIN_PREFS,
  EXPLAIN_PREFS_KEY,
  parseExplainPrefs,
  type ExplainPrefs,
} from "@/lib/explain-prefs";
import { readStorage as read, writeStorage as write } from "@/lib/storage";

export type { Theme } from "@/lib/appearance";

const SIDEBAR_KEY = "yomu-sidebar";
let peekTimer: ReturnType<typeof setTimeout>;

interface UiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Typeface, size and column width of the article. */
  reader: ReaderPrefs;
  setReader: (patch: Partial<ReaderPrefs>) => void;
  /** Hides everything except the article (Cmd/Ctrl+.). */
  focusMode: boolean;
  setFocusMode: (on: boolean) => void;
  /** The spaces sidebar is docked (true) or collapsed (false). */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** While collapsed, the sidebar slides over the page as long as the
   * pointer is on the toggle or the sidebar. */
  sidebarPeek: boolean;
  peekSidebar: (on: boolean) => void;
  /** Don't fetch images from remote hosts (they can track the reader). */
  blockRemoteImages: boolean;
  setBlockRemoteImages: (block: boolean) => void;
  /** The command palette (Cmd/Ctrl+K). */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** True while the reader is wide enough to show answers in its margin;
   * the answer sheet above the Ask bar is only used when it is not. */
  /** The article title has scrolled out of view (the top bar shows it). */
  pastTitle: boolean;
  setPastTitle: (past: boolean) => void;
  notesInMargin: boolean;
  setNotesInMargin: (on: boolean) => void;
  /** The answer sheet above the Ask bar (Cmd/Ctrl+J). */
  answerOpen: boolean;
  setAnswerOpen: (open: boolean) => void;
  /** Which highlight's answer the sheet shows; null means the latest. */
  answerFocus: string | null;
  setAnswerFocus: (highlightId: string | null) => void;
  /** The chat panel on the right of an article. */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** The Codex setup checklist dialog. */
  setupOpen: boolean;
  setSetupOpen: (open: boolean) => void;
  /** Skill level and code-example preference, applied to every explain
   * prompt (see lib/explain-prefs.ts). */
  explainPrefs: ExplainPrefs;
  setExplainPrefs: (patch: Partial<ExplainPrefs>) => void;
}

const BLOCK_IMAGES_KEY = "yomu-block-images";

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
  sidebarOpen: read(SIDEBAR_KEY) !== "0",
  setSidebarOpen: (sidebarOpen) => {
    write(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    set({ sidebarOpen, sidebarPeek: false });
  },
  sidebarPeek: false,
  peekSidebar: (on) => {
    // A short delay on leaving lets the pointer travel from the toggle to
    // the sidebar without it closing in between.
    clearTimeout(peekTimer);
    if (on) set({ sidebarPeek: true });
    else peekTimer = setTimeout(() => set({ sidebarPeek: false }), 200);
  },
  blockRemoteImages: read(BLOCK_IMAGES_KEY) === "1",
  setBlockRemoteImages: (block) => {
    write(BLOCK_IMAGES_KEY, block ? "1" : "0");
    set({ blockRemoteImages: block });
  },
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  pastTitle: false,
  setPastTitle: (pastTitle) => set({ pastTitle }),
  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  notesInMargin: false,
  setNotesInMargin: (notesInMargin) => set({ notesInMargin }),
  answerOpen: false,
  setAnswerOpen: (answerOpen) => set({ answerOpen }),
  answerFocus: null,
  setAnswerFocus: (answerFocus) => set({ answerFocus }),
  setupOpen: false,
  setSetupOpen: (setupOpen) => set({ setupOpen }),
  explainPrefs: parseExplainPrefs(read(EXPLAIN_PREFS_KEY)),
  setExplainPrefs: (patch) => {
    const explainPrefs = {
      ...DEFAULT_EXPLAIN_PREFS,
      ...get().explainPrefs,
      ...patch,
    };
    write(EXPLAIN_PREFS_KEY, JSON.stringify(explainPrefs));
    set({ explainPrefs });
  },
}));

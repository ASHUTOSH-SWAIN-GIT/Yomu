import { create } from "zustand";
import type { Selection } from "@/stores/chat-store";

/**
 * The passage the user has selected in the article. Kept here (not read
 * from the DOM) because clicking into the Ask bar collapses the browser's
 * own selection, but the question is still about that passage.
 */
interface SelectionStore {
  selection: Selection | null;
  set: (selection: Selection | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selection: null,
  set: (selection) => set({ selection }),
}));

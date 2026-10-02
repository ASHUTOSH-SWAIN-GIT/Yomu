import { create } from "zustand";
import type { Selection } from "@/stores/chat-store";

/** A margin note the next question is a reply to ("Follow up" on a note). */
export interface ReplyTarget {
  highlightId: string;
  /** The note's number, shown as "Replying to note N". */
  number: number;
}

/**
 * What the next question in the Ask bar is about: the passage the user has
 * selected, or a note they are replying to. Kept here (not read from the
 * DOM) because clicking into the Ask bar collapses the browser's own
 * selection, but the question is still about that passage.
 */
interface SelectionStore {
  selection: Selection | null;
  set: (selection: Selection | null) => void;
  replyTo: ReplyTarget | null;
  setReplyTo: (target: ReplyTarget | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selection: null,
  // A new passage replaces any note being replied to.
  set: (selection) =>
    set((s) => ({ selection, replyTo: selection ? null : s.replyTo })),
  replyTo: null,
  // Replying to a note drops any passage still attached.
  setReplyTo: (replyTo) =>
    set((s) => ({ replyTo, selection: replyTo ? null : s.selection })),
}));

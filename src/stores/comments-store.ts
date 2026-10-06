import { create } from "zustand";
import {
  addComment,
  deleteComment,
  listComments,
  updateComment,
} from "@/lib/db";
import { logError } from "@/lib/log";
import type { Comment } from "@/types/library";

/** Where a comment being written will go: the words it is about. */
export interface Draft {
  blockIndex: number;
  start: number;
  end: number;
  quote: string;
}

interface CommentsStore {
  articleId: string | null;
  items: Comment[];
  draft: Draft | null;
  editingId: string | null;
  load: (articleId: string) => Promise<void>;
  startDraft: (draft: Draft) => void;
  cancelDraft: () => void;
  saveDraft: (note: string) => Promise<void>;
  setEditing: (id: string | null) => void;
  update: (id: string, note: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useCommentsStore = create<CommentsStore>((set, get) => ({
  articleId: null,
  items: [],
  draft: null,
  editingId: null,

  async load(articleId) {
    set({ articleId, items: [], draft: null, editingId: null });
    try {
      const items = await listComments(articleId);
      if (get().articleId === articleId) set({ items });
    } catch (err) {
      logError("loading comments failed", err);
    }
  },

  startDraft(draft) {
    set({ draft, editingId: null });
  },

  cancelDraft() {
    set({ draft: null });
  },

  async saveDraft(note) {
    const { draft, articleId } = get();
    const text = note.trim();
    if (!draft || !articleId) return;
    if (!text) return set({ draft: null });
    try {
      const comment = await addComment({ ...draft, articleId, note: text });
      set((s) => ({ draft: null, items: [...s.items, comment] }));
    } catch (err) {
      logError("saving the comment failed", err);
    }
  },

  setEditing(editingId) {
    set({ editingId, draft: null });
  },

  async update(id, note) {
    const text = note.trim();
    // Nothing left to say: the comment goes.
    if (!text) return get().remove(id);
    try {
      await updateComment(id, text);
      set((s) => ({
        editingId: null,
        items: s.items.map((c) => (c.id === id ? { ...c, note: text } : c)),
      }));
    } catch (err) {
      logError("saving the comment failed", err);
    }
  },

  async remove(id) {
    try {
      await deleteComment(id);
      set((s) => ({
        items: s.items.filter((c) => c.id !== id),
        editingId: s.editingId === id ? null : s.editingId,
      }));
    } catch (err) {
      logError("deleting the comment failed", err);
    }
  },
}));

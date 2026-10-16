import { createStore } from "zustand";
import {
  addComment,
  addMark,
  deleteComment,
  listComments,
  listMarks,
  updateComment,
} from "@/lib/db";
import { logError } from "@/lib/log";
import { registerPart, tabStore } from "@/stores/tabs";
import type { Comment, Mark } from "@/types/library";

/** Where a comment being written will go: the words it is about. */
export interface Draft {
  blockIndex: number;
  start: number;
  end: number;
  quote: string;
}

export interface CommentsStore {
  articleId: string | null;
  items: Comment[];
  /** Words the reader highlighted, with no note. */
  marks: Mark[];
  draft: Draft | null;
  editingId: string | null;
  /** The comment being pointed at: its words and its card react together. */
  activeId: string | null;
  setActive: (id: string | null) => void;
  load: (articleId: string) => Promise<void>;
  startDraft: (draft: Draft) => void;
  cancelDraft: () => void;
  saveDraft: (note: string) => Promise<void>;
  setEditing: (id: string | null) => void;
  update: (id: string, note: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  highlight: (words: Draft) => Promise<void>;
  /** Takes the highlighter off these marks; Undo puts them back. */
  unhighlight: (ids: string[]) => Promise<void>;
  /** Puts a deleted comment back (Undo), as a new comment on the same
   * words. */
  restore: (comment: Comment) => Promise<void>;
}

registerPart("comments", () =>
  createStore<CommentsStore>((set, get) => ({
    articleId: null,
    items: [],
    marks: [],
    draft: null,
    editingId: null,
    activeId: null,

    setActive(activeId) {
      if (get().activeId !== activeId) set({ activeId });
    },

    async load(articleId) {
      set({
        articleId,
        items: [],
        marks: [],
        draft: null,
        editingId: null,
        activeId: null,
      });
      try {
        const [items, marks] = await Promise.all([
          listComments(articleId),
          listMarks(articleId),
        ]);
        if (get().articleId === articleId) set({ items, marks });
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

    async highlight(words) {
      const { articleId } = get();
      if (!articleId) return;
      try {
        const mark = await addMark({ ...words, articleId });
        if (get().articleId === articleId)
          set((s) => ({ marks: [...s.marks, mark] }));
      } catch (err) {
        logError("saving the highlight failed", err);
      }
    },

    async unhighlight(ids) {
      try {
        await Promise.all(ids.map(deleteComment));
        set((s) => ({ marks: s.marks.filter((m) => !ids.includes(m.id)) }));
      } catch (err) {
        logError("removing the highlight failed", err);
      }
    },

    async restore(comment) {
      try {
        const { blockIndex, start, end, quote, note, articleId } = comment;
        const back = await addComment({
          blockIndex,
          start,
          end,
          quote,
          note,
          articleId,
        });
        if (get().articleId === articleId)
          set((s) => ({ items: [...s.items, back] }));
      } catch (err) {
        logError("restoring the comment failed", err);
      }
    },

    async remove(id) {
      try {
        await deleteComment(id);
        set((s) => ({
          items: s.items.filter((c) => c.id !== id),
          editingId: s.editingId === id ? null : s.editingId,
          activeId: s.activeId === id ? null : s.activeId,
        }));
      } catch (err) {
        logError("deleting the comment failed", err);
      }
    },
  })),
);

export const useCommentsStore = tabStore("comments");

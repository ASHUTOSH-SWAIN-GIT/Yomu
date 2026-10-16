import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment, Mark } from "@/types/library";

const h = vi.hoisted(() => ({
  rows: [] as Comment[],
  marks: [] as Mark[],
  n: 0,
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  listComments: async (articleId: string) =>
    h.rows.filter((r) => r.articleId === articleId),
  listMarks: async (articleId: string) =>
    h.marks.filter((r) => r.articleId === articleId),
  addMark: async (m: Omit<Mark, "id" | "createdAt">) => {
    const row = { ...m, id: `m${++h.n}`, createdAt: h.n };
    h.marks.push(row);
    return row;
  },
  addComment: async (c: Omit<Comment, "id">) => {
    const row = { ...c, id: `c${++h.n}`, createdAt: h.n };
    h.rows.push(row);
    return row;
  },
  updateComment: async (id: string, note: string) => {
    h.rows = h.rows.map((r) => (r.id === id ? { ...r, note } : r));
  },
  deleteComment: async (id: string) => {
    h.rows = h.rows.filter((r) => r.id !== id);
    h.marks = h.marks.filter((r) => r.id !== id);
  },
}));

import { useCommentsStore } from "@/stores/comments-store";

const store = () => useCommentsStore.getState();
const draft = { blockIndex: 3, start: 4, end: 22, quote: "the selected words" };

beforeEach(async () => {
  h.rows = [];
  h.marks = [];
  h.n = 0;
  await store().load("a1");
});

describe("highlights", () => {
  it("saves a highlight, keeps it on reload, and takes it off", async () => {
    await store().highlight(draft);
    expect(store().marks).toMatchObject([{ ...draft, articleId: "a1" }]);
    expect(store().items).toEqual([]);

    await store().load("a1");
    expect(store().marks).toHaveLength(1);

    await store().unhighlight([store().marks[0].id]);
    expect(store().marks).toEqual([]);
    await store().load("a1");
    expect(store().marks).toEqual([]);
  });
});

describe("comments", () => {
  it("saves a comment on a paragraph and keeps it for that article only", async () => {
    store().startDraft(draft);
    await store().saveDraft("  Good point  ");
    expect(store().items).toMatchObject([
      { ...draft, articleId: "a1", note: "Good point" },
    ]);
    expect(store().draft).toBeNull();

    await store().load("a2");
    expect(store().items).toEqual([]);
    await store().load("a1");
    expect(store().items).toHaveLength(1);
  });

  it("does not save an empty comment", async () => {
    store().startDraft(draft);
    await store().saveDraft("   ");
    expect(store().items).toEqual([]);
    expect(store().draft).toBeNull();
    expect(h.rows).toEqual([]);
  });

  it("cancelling throws the draft away", async () => {
    store().startDraft(draft);
    store().cancelDraft();
    expect(store().draft).toBeNull();
  });

  it("edits a comment, and deletes it when its text is emptied", async () => {
    store().startDraft(draft);
    await store().saveDraft("first");
    const id = store().items[0].id;

    store().setEditing(id);
    await store().update(id, "second");
    expect(store().items[0].note).toBe("second");
    expect(store().editingId).toBeNull();

    await store().update(id, "  ");
    expect(store().items).toEqual([]);
  });

  it("deletes a comment", async () => {
    store().startDraft(draft);
    await store().saveDraft("x");
    await store().remove(store().items[0].id);
    expect(store().items).toEqual([]);
    expect(h.rows).toEqual([]);
  });

  it("puts a deleted comment back on the same words (Undo)", async () => {
    store().startDraft(draft);
    await store().saveDraft("Keep me");
    const [comment] = store().items;
    await store().remove(comment.id);
    await store().restore(comment);
    expect(store().items).toMatchObject([
      { ...draft, articleId: "a1", note: "Keep me" },
    ]);
    expect(h.rows).toHaveLength(1);
  });

  it("restoring after moving to another article does not show it there", async () => {
    store().startDraft(draft);
    await store().saveDraft("Old page");
    const [comment] = store().items;
    await store().remove(comment.id);
    await store().load("a2");
    await store().restore(comment);
    expect(store().items).toEqual([]);
    expect(h.rows).toMatchObject([{ articleId: "a1", note: "Old page" }]);
  });

  it("tracks the comment being pointed at, and forgets it when it is deleted", async () => {
    store().startDraft(draft);
    await store().saveDraft("x");
    const id = store().items[0].id;
    store().setActive(id);
    expect(store().activeId).toBe(id);
    store().setActive(null);
    expect(store().activeId).toBeNull();

    store().setActive(id);
    await store().remove(id);
    expect(store().activeId).toBeNull();
  });
});

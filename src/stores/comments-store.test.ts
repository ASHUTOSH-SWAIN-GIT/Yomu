import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "@/types/library";

const h = vi.hoisted(() => ({ rows: [] as Comment[], n: 0 }));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  listComments: async (articleId: string) =>
    h.rows.filter((r) => r.articleId === articleId),
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
  },
}));

import { useCommentsStore } from "@/stores/comments-store";

const store = () => useCommentsStore.getState();
const draft = { blockIndex: 3, start: 4, end: 22, quote: "the selected words" };

beforeEach(async () => {
  h.rows = [];
  h.n = 0;
  await store().load("a1");
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

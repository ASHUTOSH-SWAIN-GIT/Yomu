import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
}));

vi.mock("@/stores/library-store", () => ({
  useLibraryStore: {
    getState: () => ({
      addTag: async (id: string, tag: string) =>
        void h.calls.push(`add ${id} ${tag}`),
      removeTag: async (id: string, tag: string) =>
        void h.calls.push(`remove ${id} ${tag}`),
    }),
  },
}));
vi.mock("@/stores/spaces-store", () => ({
  useSpacesStore: { getState: () => ({}) },
}));

import { moveToCollection } from "@/lib/collections";
import { INBOX } from "@/lib/spaces";

beforeEach(() => {
  h.calls = [];
});

describe("moveToCollection", () => {
  it("joins the new collection before leaving the old one", async () => {
    expect(await moveToCollection("a1", "rust", "go")).toBe(true);
    expect(h.calls).toEqual(["add a1 go", "remove a1 rust"]);
  });

  it("does nothing when dropped on the collection it came from", async () => {
    expect(await moveToCollection("a1", "rust", "rust")).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("never drops a blog into the Inbox, which is having no collection", async () => {
    expect(await moveToCollection("a1", "rust", INBOX)).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("only adds when the blog came from the Inbox", async () => {
    expect(await moveToCollection("a1", INBOX, "go")).toBe(true);
    expect(h.calls).toEqual(["add a1 go"]);
  });
});

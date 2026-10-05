import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tagged: [] as [string, string][],
  extra: [] as string[],
  articles: [] as { archived: boolean; tags: string[] }[],
}));

vi.mock("@/lib/db", () => ({
  addArticleTag: async (id: string, tag: string) =>
    void h.tagged.push([id, tag]),
}));
vi.mock("@/stores/spaces-store", () => ({
  useSpacesStore: { getState: () => ({ extra: h.extra }) },
}));
vi.mock("@/stores/library-store", () => ({
  useLibraryStore: { getState: () => ({ articles: h.articles }) },
}));

import { saveToDefaultCollection } from "@/lib/default-collection";

beforeEach(() => {
  h.tagged = [];
  h.extra = [];
  h.articles = [];
});

describe("saveToDefaultCollection", () => {
  it("creates the default collection for a user with none", async () => {
    await saveToDefaultCollection("a1");
    expect(h.tagged).toEqual([["a1", "collection"]]);
  });

  it("keeps filling it once it exists, even beside other collections", async () => {
    h.articles = [{ archived: false, tags: ["collection", "rust"] }];
    await saveToDefaultCollection("a2");
    expect(h.tagged).toEqual([["a2", "collection"]]);
  });

  it("leaves a user who has their own collections and no default alone", async () => {
    h.extra = ["rust"];
    await saveToDefaultCollection("a3");
    expect(h.tagged).toEqual([]);
    h.extra = [];
    h.articles = [{ archived: false, tags: ["web"] }];
    await saveToDefaultCollection("a3");
    expect(h.tagged).toEqual([]);
  });

  it("does not count collections that only archived blogs are in", async () => {
    h.articles = [{ archived: true, tags: ["old"] }];
    await saveToDefaultCollection("a4");
    expect(h.tagged).toEqual([["a4", "collection"]]);
  });
});

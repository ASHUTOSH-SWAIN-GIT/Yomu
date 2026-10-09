import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkLink } from "@/lib/bookmarks";

const h = vi.hoisted(() => ({
  links: [] as {
    url: string;
    title: string;
    browser: string;
    added: number | null;
  }[],
  imports: new Map<string, { status: "saved" | "failed"; tries: number }>(),
  existing: new Set<string>(),
  failing: new Set<string>(),
  inbox: new Set<string>(),
  saved: [] as string[],
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  scanBookmarks: async () => ({
    links: h.links,
    browsers: [{ name: "Brave", found: true, hasFolder: true }],
  }),
  canonicalizeUrl: async (url: string) => url,
  scrapeUrl: async (url: string) => {
    if (h.failing.has(url)) throw new Error("could not fetch");
    return { canonicalUrl: url, url, title: url };
  },
}));
vi.mock("@/lib/db", () => ({
  listBookmarkImports: async () => new Map(h.imports),
  recordBookmarkImport: async (url: string, status: "saved" | "failed") => {
    const before = h.imports.get(url);
    h.imports.set(url, {
      status,
      tries: (before?.tries ?? 0) + (status === "failed" ? 1 : 0),
    });
  },
  getArticleByCanonicalUrl: async (url: string) =>
    h.existing.has(url) ? { id: `old-${url}` } : null,
  upsertArticle: async (a: { canonicalUrl: string }) => {
    h.saved.push(a.canonicalUrl);
    return { id: `new-${a.canonicalUrl}` };
  },
  setInbox: async (id: string, on: boolean) => {
    if (on) h.inbox.add(id);
    else h.inbox.delete(id);
  },
}));
vi.mock("@/lib/default-collection", () => ({
  saveToDefaultCollection: vi.fn(async () => {}),
}));
vi.mock("@/stores/library-store", () => ({
  useLibraryStore: { getState: () => ({ refresh: vi.fn(async () => {}) }) },
}));

import { useBookmarksStore } from "@/stores/bookmarks-store";

const link = (url: string, added = 1): BookmarkLink => ({
  url,
  title: url,
  browser: "Brave",
  added,
});
const store = () => useBookmarksStore.getState();

beforeEach(() => {
  h.links = [];
  h.imports = new Map();
  h.existing = new Set();
  h.failing = new Set();
  h.inbox = new Set();
  h.saved = [];
  useBookmarksStore.setState({ enabled: true, saved: 0, waiting: 0 });
});

describe("saving bookmarked pages", () => {
  it("saves a new page into the Inbox and remembers it", async () => {
    h.links = [link("https://a.dev/1")];
    await store().check();
    expect(h.saved).toEqual(["https://a.dev/1"]);
    expect(h.inbox.has("new-https://a.dev/1")).toBe(true);
    expect(h.imports.get("https://a.dev/1")?.status).toBe("saved");
    expect(store().saved).toBe(1);
    expect(store().browsers[0].name).toBe("Brave");
  });

  it("does not save the same page twice", async () => {
    h.links = [link("https://a.dev/1")];
    await store().check();
    await store().check();
    expect(h.saved).toHaveLength(1);
  });

  it("does not put a page already in the library into the Inbox", async () => {
    h.existing.add("https://a.dev/1");
    h.links = [link("https://a.dev/1")];
    await store().check();
    expect(h.saved).toEqual([]);
    expect(h.inbox.size).toBe(0);
    expect(h.imports.get("https://a.dev/1")?.status).toBe("saved");
  });

  it("notes a page that could not be fetched, and tries it again later", async () => {
    h.failing.add("https://bad.dev/x");
    h.links = [link("https://bad.dev/x"), link("https://a.dev/1", 0)];
    await store().check();
    // The good one is not held up by the bad one.
    expect(h.saved).toEqual(["https://a.dev/1"]);
    expect(h.imports.get("https://bad.dev/x")).toEqual({
      status: "failed",
      tries: 1,
    });

    h.failing.clear();
    await store().check();
    expect(h.saved).toContain("https://bad.dev/x");
  });

  it("gives up on a page after its tries", async () => {
    h.failing.add("https://bad.dev/x");
    h.links = [link("https://bad.dev/x")];
    for (let i = 0; i < 6; i++) await store().check();
    expect(h.imports.get("https://bad.dev/x")?.tries).toBe(3);
  });

  it("does nothing while switched off", async () => {
    useBookmarksStore.setState({ enabled: false });
    h.links = [link("https://a.dev/1")];
    await store().check();
    expect(h.saved).toEqual([]);
  });

  it("takes a big folder in passes", async () => {
    h.links = Array.from({ length: 25 }, (_, i) =>
      link(`https://a.dev/${i}`, i + 1),
    );
    await store().check();
    expect(h.saved).toHaveLength(20);
    expect(store().waiting).toBe(5);
    await store().check();
    expect(h.saved).toHaveLength(25);
    expect(store().waiting).toBe(0);
  });
});

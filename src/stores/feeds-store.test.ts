import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feed, FoundFeed } from "@/lib/feeds";
import { MIN_GAP_MS } from "@/lib/feeds";

const h = vi.hoisted(() => ({
  found: null as unknown,
  feeds: [] as Feed[],
  items: new Map<string, Map<string, boolean>>(), // feed id -> url -> dismissed
  existing: new Set<string>(),
  failing: new Set<string>(),
  inbox: new Set<string>(),
  saved: [] as string[],
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  discoverFeed: async () => h.found,
  readFeed: async () => h.found,
  canonicalizeUrl: async (url: string) => url,
  scrapeUrl: async (url: string) => {
    if (h.failing.has(url)) throw new Error("could not fetch");
    return { canonicalUrl: url, url, title: url };
  },
}));
vi.mock("@/lib/db", () => ({
  listFeeds: async () => [...h.feeds],
  addFeed: async (f: {
    feedUrl: string;
    siteUrl: string | null;
    title: string;
  }) => {
    const feed: Feed = {
      id: `id-${h.feeds.length}`,
      addedAt: 1,
      lastChecked: null,
      ...f,
    };
    h.feeds.push(feed);
    return feed;
  },
  removeFeed: async (id: string) => {
    h.items.delete(id);
    h.feeds = h.feeds.filter((f) => f.id !== id);
  },
  listFeedItemUrls: async (id: string) => new Set(h.items.get(id)?.keys()),
  recordFeedItems: async (
    id: string,
    entries: { url: string }[],
    dismissed: boolean,
  ) => {
    const items = h.items.get(id) ?? new Map();
    for (const e of entries) if (!items.has(e.url)) items.set(e.url, dismissed);
    h.items.set(id, items);
  },
  markFeedChecked: async (id: string, at: number) => {
    const feed = h.feeds.find((f) => f.id === id);
    if (feed) feed.lastChecked = at;
  },
  getArticleByCanonicalUrl: async (url: string) =>
    h.existing.has(url) ? { id: `old-${url}` } : null,
  upsertArticle: async (a: { canonicalUrl: string }) => {
    h.saved.push(a.canonicalUrl);
    return { id: `new-${a.canonicalUrl}` };
  },
  setInbox: async (id: string, on: boolean) => {
    if (on) h.inbox.add(id);
  },
}));
vi.mock("@/stores/library-store", () => ({
  useLibraryStore: { getState: () => ({ refresh: vi.fn(async () => {}) }) },
}));

import { useFeedsStore } from "@/stores/feeds-store";

const post = (n: number) => ({
  url: `https://b.dev/${n}`,
  title: `Post ${n}`,
  publishedAt: 100 - n,
});
const found = (n: number): FoundFeed => ({
  feedUrl: "https://b.dev/feed",
  siteUrl: "https://b.dev/",
  title: "B",
  entries: Array.from({ length: n }, (_, i) => post(i + 1)),
});
const store = () => useFeedsStore.getState();

beforeEach(() => {
  h.feeds = [];
  h.items = new Map();
  h.existing = new Set();
  h.failing = new Set();
  h.inbox = new Set();
  h.saved = [];
  useFeedsStore.setState({ feeds: [], checking: false });
});

describe("subscribing to a blog", () => {
  it("saves nothing now and notes the posts already out as seen", async () => {
    h.found = found(6);
    await store().subscribe("https://b.dev/post");
    expect(h.saved).toEqual([]);
    const items = h.items.get("id-0")!;
    expect(items.size).toBe(6);
    expect(items.get("https://b.dev/1")).toBe(true);
    expect(store().feeds).toHaveLength(1);
  });

  it("does nothing when the blog is already subscribed to", async () => {
    h.found = found(2);
    await store().subscribe("https://b.dev/post");
    const again = await store().subscribe("https://b.dev/post");
    expect(again.existing).toBe(true);
    expect(h.feeds).toHaveLength(1);
  });
});

describe("checking subscribed blogs", () => {
  async function subscribed(n: number) {
    h.found = found(n);
    await store().subscribe("https://b.dev/post");
    h.saved = [];
  }

  it("saves only the posts not seen before", async () => {
    await subscribed(3);
    h.feeds[0].lastChecked = Date.now() - MIN_GAP_MS - 1000;
    await store().load();
    h.found = found(5);
    await store().check();
    expect(h.saved).toEqual(["https://b.dev/4", "https://b.dev/5"]);
  });

  it("skips a blog checked a moment ago", async () => {
    await subscribed(1);
    h.found = found(3);
    await store().check();
    expect(h.saved).toEqual([]);
  });

  it("sets aside a post that cannot be fetched and does not retry it", async () => {
    await subscribed(1);
    h.feeds[0].lastChecked = 0;
    await store().load();
    h.found = found(2);
    h.failing.add("https://b.dev/2");
    await store().check();
    expect(h.items.get("id-0")!.get("https://b.dev/2")).toBe(true);
    h.feeds[0].lastChecked = 0;
    await store().load();
    h.failing.clear();
    await store().check();
    expect(h.saved).toEqual([]);
  });
});

describe("unsubscribing", () => {
  it("removes the blog and its posts", async () => {
    h.found = found(2);
    await store().subscribe("https://b.dev/post");
    await store().unsubscribe("id-0");
    expect(store().feeds).toEqual([]);
    expect(h.items.size).toBe(0);
  });
});

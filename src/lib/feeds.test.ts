import { describe, expect, it } from "vitest";
import {
  feedForHost,
  planImport,
  type Feed,
  type FeedEntry,
} from "@/lib/feeds";

const entry = (url: string): FeedEntry => ({ url, title: url, publishedAt: 1 });
const feed = (feedUrl: string, siteUrl: string | null): Feed => ({
  id: feedUrl,
  feedUrl,
  siteUrl,
  title: "Blog",
  addedAt: 1,
  lastChecked: null,
});

describe("planImport", () => {
  const entries = ["a", "b", "c", "d"].map((x) => entry(`https://x.dev/${x}`));

  it("takes the newest unseen posts and skips the rest", () => {
    const { take, skip } = planImport(entries, new Set(), 3);
    expect(take.map((e) => e.url)).toEqual([
      "https://x.dev/a",
      "https://x.dev/b",
      "https://x.dev/c",
    ]);
    expect(skip.map((e) => e.url)).toEqual(["https://x.dev/d"]);
  });

  it("leaves out posts already seen", () => {
    const { take, skip } = planImport(entries, new Set(["https://x.dev/a"]), 2);
    expect(take.map((e) => e.url)).toEqual([
      "https://x.dev/b",
      "https://x.dev/c",
    ]);
    expect(skip.map((e) => e.url)).toEqual(["https://x.dev/d"]);
  });

  it("counts a post listed twice once", () => {
    const { take } = planImport([entries[0], entries[0]], new Set(), 5);
    expect(take).toHaveLength(1);
  });
});

describe("feedForHost", () => {
  const feeds = [
    feed("https://blog.dev/feed", "https://www.blog.dev/"),
    feed("https://medium.com/feed/@jo", "https://medium.com/@jo"),
  ];

  it("matches an article on the blog's site, ignoring www", () => {
    expect(feedForHost(feeds, "https://blog.dev/posts/1")?.feedUrl).toBe(
      "https://blog.dev/feed",
    );
  });

  it("matches by the feed's host when the site is unknown", () => {
    expect(
      feedForHost([feed("https://a.dev/rss", null)], "https://www.a.dev/x"),
    ).not.toBeNull();
  });

  it("finds nothing for another site or a bad address", () => {
    expect(feedForHost(feeds, "https://other.dev/x")).toBeNull();
    expect(feedForHost(feeds, "not a url")).toBeNull();
  });
});

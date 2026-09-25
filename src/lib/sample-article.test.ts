import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ upsertArticle: vi.fn() }));
vi.mock("@/stores/library-store", () => ({
  useLibraryStore: { getState: () => ({ refresh: vi.fn() }) },
}));
vi.mock("@/stores/tabs-store", () => ({
  useTabsStore: { getState: () => ({ openArticle: vi.fn() }) },
}));

import { SAMPLE_ARTICLE } from "@/lib/sample-article";
import { articleText } from "@/lib/article-text";
import { readingMinutes } from "@/lib/reading";

describe("SAMPLE_ARTICLE", () => {
  it("is never fetched: its canonical URL is not a web address", () => {
    expect(SAMPLE_ARTICLE.canonicalUrl).not.toMatch(/^https?:/);
  });

  it("is a real, short article with structure to select and ask about", () => {
    const types = new Set(SAMPLE_ARTICLE.blocks.map((b) => b.type));
    expect(types.has("heading")).toBe(true);
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("list")).toBe(true);
    const words = articleText(SAMPLE_ARTICLE.blocks).split(/\s+/).length;
    expect(words).toBeGreaterThan(150);
    expect(readingMinutes(SAMPLE_ARTICLE.blocks)).toBeLessThanOrEqual(3);
  });

  it("names the actions it teaches, so it stays in step with the app", () => {
    const text = articleText(SAMPLE_ARTICLE.blocks);
    for (const word of [
      "Select",
      "Cmd+K",
      "Cmd+.",
      "Aa",
      "Focus mode",
      "space",
    ]) {
      expect(text).toContain(word);
    }
  });

  it("has a title and a valid source link", () => {
    expect(SAMPLE_ARTICLE.title).toBe("How to read with Yomu");
    expect(() => new URL(SAMPLE_ARTICLE.url)).not.toThrow();
  });
});

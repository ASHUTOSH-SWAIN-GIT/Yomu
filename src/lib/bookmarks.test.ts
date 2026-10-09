import { describe, expect, it } from "vitest";
import { MAX_TRIES, pendingLinks, type BookmarkLink } from "@/lib/bookmarks";
import type { BookmarkImport } from "@/lib/db";

const link = (url: string, added: number | null = null): BookmarkLink => ({
  url,
  title: url,
  browser: "Brave",
  added,
});
const tried = (entries: Record<string, BookmarkImport>) =>
  new Map(Object.entries(entries));

describe("pendingLinks", () => {
  it("is every page not seen before", () => {
    expect(
      pendingLinks([link("a"), link("b")], tried({})).map((l) => l.url),
    ).toEqual(["a", "b"]);
  });

  it("leaves out pages already saved", () => {
    const out = pendingLinks(
      [link("a"), link("b")],
      tried({ a: { status: "saved", tries: 0 } }),
    );
    expect(out.map((l) => l.url)).toEqual(["b"]);
  });

  it("tries a failed page again, until it has had its tries", () => {
    const failed = (tries: number) =>
      pendingLinks([link("a")], tried({ a: { status: "failed", tries } }));
    expect(failed(1)).toHaveLength(1);
    expect(failed(MAX_TRIES - 1)).toHaveLength(1);
    expect(failed(MAX_TRIES)).toHaveLength(0);
  });

  it("puts the newest bookmark first, and undated ones last", () => {
    const out = pendingLinks(
      [link("old", 100), link("none"), link("new", 300), link("mid", 200)],
      tried({}),
    );
    expect(out.map((l) => l.url)).toEqual(["new", "mid", "old", "none"]);
  });
});

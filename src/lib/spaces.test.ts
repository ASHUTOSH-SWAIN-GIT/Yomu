import { describe, expect, it } from "vitest";
import {
  INBOX,
  SPACE_SLOTS,
  articlesInSpace,
  assignSlots,
  buildSpaces,
  displaySpaceName,
  slotOf,
  spaceOfArticle,
} from "@/lib/spaces";
import type { ArticleSummary } from "@/types/library";

const art = (id: string, tags: string[], archived = false): ArticleSummary => ({
  id,
  title: id,
  author: null,
  site: "x.dev",
  canonicalUrl: `https://x.dev/${id}`,
  scrapedAt: 0,
  publishedAt: null,
  progress: 0,
  archived,
  tags,
});

describe("displaySpaceName", () => {
  it("prettifies tags and names the inbox", () => {
    expect(displaySpaceName("reading-list")).toBe("Reading list");
    expect(displaySpaceName("rust")).toBe("Rust");
    expect(displaySpaceName(INBOX)).toBe("Home");
    expect(displaySpaceName("ai")).toBe("AI");
    expect(displaySpaceName("web")).toBe("Web");
  });
});

describe("assignSlots", () => {
  it("gives new spaces the lowest unused slots, in order", () => {
    expect(assignSlots(["rust", "web", "ai"], {})).toEqual({
      rust: 0,
      web: 1,
      ai: 2,
    });
  });

  it("never changes an existing colour when spaces are added or removed", () => {
    const first = assignSlots(["rust", "web", "ai"], {});
    // 'ai' is removed and 'infra' added: 'rust' and 'web' keep their colours.
    const next = assignSlots(["rust", "web", "infra"], first);
    expect(next.rust).toBe(first.rust);
    expect(next.web).toBe(first.web);
    expect(next.infra).toBe(2); // takes the freed slot
  });

  it("ignores invalid stored slots", () => {
    const next = assignSlots(["a", "b"], { a: 99, b: -1 });
    expect(next).toEqual({ a: 0, b: 1 });
  });

  it("reuses the least used slot once all are taken, spreading evenly", () => {
    const names = Array.from({ length: SPACE_SLOTS + 2 }, (_, i) => `s${i}`);
    const slots = assignSlots(names, {});
    const counts = new Map<number, number>();
    for (const slot of Object.values(slots))
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(slots.s8).toBe(0);
    expect(slots.s9).toBe(1);
  });
});

describe("articlesInSpace", () => {
  const list = [
    art("a", ["rust"]),
    art("b", ["rust", "web"]),
    art("c", []),
    art("d", ["rust"], true),
  ];
  it("lists active articles by tag, and untagged ones under the inbox", () => {
    expect(articlesInSpace(list, "rust").map((a) => a.id)).toEqual(["a", "b"]);
    expect(articlesInSpace(list, "web").map((a) => a.id)).toEqual(["b"]);
    expect(articlesInSpace(list, INBOX).map((a) => a.id)).toEqual(["c"]);
  });
});

describe("buildSpaces", () => {
  const list = [
    art("a", ["rust"]),
    art("b", ["rust", "web"]),
    art("c", ["web"]),
    art("d", ["rust"]),
    art("e", ["ai"]),
  ];
  const slots = { rust: 0, web: 1, ai: 2 };

  it("orders spaces by size then name, with counts and colours", () => {
    const spaces = buildSpaces(list, [], slots, "rust");
    expect(spaces.map((s) => [s.id, s.count, s.slot])).toEqual([
      ["rust", 3, 0],
      ["web", 2, 1],
      ["ai", 1, 2],
    ]);
  });

  it("shows the inbox only when it has articles or is active", () => {
    expect(
      buildSpaces(list, [], slots, "rust").some((s) => s.id === INBOX),
    ).toBe(false);
    expect(buildSpaces(list, [], slots, INBOX)[0]).toMatchObject({
      id: INBOX,
      count: 0,
    });
    const withUntagged = buildSpaces(
      [...list, art("z", [])],
      [],
      slots,
      "rust",
    );
    expect(withUntagged[0]).toMatchObject({ id: INBOX, count: 1, slot: null });
  });

  it("includes empty spaces the user created, and ignores archived-only tags", () => {
    const spaces = buildSpaces(
      [art("x", ["old"], true)],
      ["fresh"],
      { fresh: 3 },
      "fresh",
    );
    expect(spaces.map((s) => s.id)).toEqual(["fresh"]);
  });
});

describe("spaceOfArticle and slotOf", () => {
  it("prefers the active space, then the first tag, then the inbox", () => {
    expect(spaceOfArticle({ tags: ["rust", "web"] }, "web")).toBe("web");
    expect(spaceOfArticle({ tags: ["rust", "web"] }, "ai")).toBe("rust");
    expect(spaceOfArticle({ tags: [] }, "rust")).toBe(INBOX);
  });

  it("gives the inbox and unknown spaces no colour slot", () => {
    expect(slotOf(INBOX, { rust: 0 })).toBeNull();
    expect(slotOf("rust", { rust: 4 })).toBe(4);
    expect(slotOf("nope", { rust: 4 })).toBeNull();
  });
});

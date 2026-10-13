import { describe, expect, it } from "vitest";
import { findMatches, firstFrom, occurrences, shownText } from "@/lib/find";
import type { Block } from "@/types/article";

const para = (...texts: string[]): Block => ({
  type: "paragraph",
  spans: texts.map((text) => ({ text })),
});

describe("occurrences", () => {
  it("ignores case and does not overlap", () => {
    expect(occurrences("Rust rust RUST", "rust")).toEqual([0, 5, 10]);
    expect(occurrences("aaaa", "aa")).toEqual([0, 2]);
  });

  it("finds nothing for an empty query", () => {
    expect(occurrences("anything", "")).toEqual([]);
  });
});

describe("shownText", () => {
  it("leaves out the Markdown marks the agent gets", () => {
    expect(shownText({ type: "heading", level: 2, text: "Setup" })).toBe(
      "Setup",
    );
    expect(
      shownText({ type: "code", language: "rust", content: "fn main() {}" }),
    ).toBe("fn main() {}");
  });

  it("skips formulas and pictures, as the page search does", () => {
    expect(
      shownText({
        type: "paragraph",
        spans: [{ text: "x = " }, { text: "\\alpha", math: true }],
      }),
    ).toBe("x = ");
    expect(shownText({ type: "math", tex: "e^x" })).toBe("");
    expect(
      shownText({ type: "image", src: "a.png", alt: "a diagram of rust" }),
    ).toBe("");
  });

  it("reads lists and tables cell by cell", () => {
    expect(
      shownText({
        type: "list",
        ordered: false,
        items: [
          { spans: [{ text: "one" }], depth: 0 },
          { spans: [{ text: "two" }], depth: 1 },
        ],
      }),
    ).toBe("onetwo");
    expect(
      shownText({ type: "table", header: ["a", "b"], rows: [["c", "d"]] }),
    ).toBe("abcd");
  });
});

describe("findMatches", () => {
  it("lists every match in reading order, numbered within its block", () => {
    const blocks = [para("Tokio and tokio"), para("nothing"), para("tokio")];
    expect(findMatches(blocks, "tokio")).toEqual([
      { block: 0, nth: 0 },
      { block: 0, nth: 1 },
      { block: 2, nth: 0 },
    ]);
  });

  it("finds a word split across spans, as the page shows it", () => {
    expect(findMatches([para("bor", "row")], "borrow")).toEqual([
      { block: 0, nth: 0 },
    ]);
  });
});

describe("firstFrom", () => {
  const matches = [
    { block: 1, nth: 0 },
    { block: 4, nth: 0 },
    { block: 9, nth: 0 },
  ];

  it("starts at the first match from where you are reading", () => {
    expect(firstFrom(matches, 3)).toBe(1);
    expect(firstFrom(matches, 4)).toBe(1);
  });

  it("wraps to the first match when none is further on", () => {
    expect(firstFrom(matches, 10)).toBe(0);
  });
});

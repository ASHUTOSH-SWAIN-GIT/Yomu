import { describe, expect, it } from "vitest";
import { citedNumbers, findCitations, referencesOf } from "@/lib/citations";
import type { Block } from "@/types/article";

const para = (text: string): Block => ({
  type: "paragraph",
  spans: [{ text }],
});

describe("a paper's references", () => {
  it("reads the numbered entries under the References heading", () => {
    const refs = referencesOf([
      para("Body text citing [1]."),
      { type: "heading", level: 2, text: "References" },
      para("[1] A. Author. A paper. 2011."),
      para("2. B. Author. Another paper."),
      para("Not an entry"),
      { type: "heading", level: 2, text: "A Appendix" },
      para("[3] Not a reference, it is after the list."),
    ]);
    expect([...refs]).toEqual([
      ["1", "A. Author. A paper. 2011."],
      ["2", "B. Author. Another paper."],
    ]);
  });

  it("is empty for a paper without a numbered list", () => {
    expect(referencesOf([para("text")]).size).toBe(0);
  });
});

describe("citations in the text", () => {
  const refs = new Map(
    ["1", "2", "3", "4", "5", "12"].map((n) => [n, `ref ${n}`]),
  );

  it("finds single, listed and ranged citations", () => {
    expect(findCitations("as in [12] and [1, 3] or [2–4].", refs)).toEqual([
      { start: 6, end: 10, numbers: ["12"] },
      { start: 15, end: 21, numbers: ["1", "3"] },
      { start: 25, end: 30, numbers: ["2", "3", "4"] },
    ]);
  });

  it("leaves brackets that are not citations of this paper", () => {
    expect(findCitations("a[0] and [99] and [sic]", refs)).toEqual([]);
  });

  it("expands ranges, but not absurd ones", () => {
    expect(citedNumbers("5-7")).toEqual(["5", "6", "7"]);
    expect(citedNumbers("1-500")).toEqual(["1"]);
  });
});

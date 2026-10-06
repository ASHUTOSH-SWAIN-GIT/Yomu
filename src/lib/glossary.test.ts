import { describe, expect, it } from "vitest";
import {
  buildGlossary,
  cleanTerm,
  gist,
  termFinder,
  type GlossaryTerm,
} from "@/lib/glossary";

const entry = (term: string, answer = `About ${term}.`): GlossaryTerm => ({
  term,
  answer,
  articleId: "a1",
  articleTitle: "Post",
});

describe("cleanTerm", () => {
  it("accepts a few words and tidies the edges of the selection", () => {
    expect(cleanTerm("  write-ahead   log, ")).toBe("write-ahead log");
    expect(cleanTerm("“Pageserver”")).toBe("Pageserver");
    expect(cleanTerm("MVCC")).toBe("MVCC");
  });

  it("refuses sentences, long passages, tiny ones and non-words", () => {
    expect(cleanTerm("The pageserver stores pages. It is fast.")).toBeNull();
    expect(cleanTerm("one two three four five")).toBeNull();
    expect(cleanTerm("a".repeat(41))).toBeNull();
    expect(cleanTerm("it")).toBeNull();
    expect(cleanTerm("123 456")).toBeNull();
    expect(cleanTerm("![diagram](https://x.dev/a.png)")).toBeNull();
  });
});

describe("buildGlossary", () => {
  const row = (text: string, answer: string | null, answeredAt: number) => ({
    text,
    answer,
    articleId: "a1",
    articleTitle: "Post",
    answeredAt,
  });

  it("keeps the latest answer for a term, whatever its case", () => {
    const g = buildGlossary([
      row("Pageserver", "old", 1),
      row("pageserver", "new", 2),
      row("PAGESERVER", "older", 0),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].answer).toBe("new");
  });

  it("skips passages that are no term and ones never answered", () => {
    expect(
      buildGlossary([
        row("A whole sentence about things. Another one.", "x", 1),
        row("Raft", null, 1),
        row("Raft", "  ", 2),
      ]),
    ).toEqual([]);
  });
});

describe("termFinder", () => {
  const find = (text: string, terms: string[]) =>
    termFinder(terms.map((t) => entry(t)))(text).map((m) =>
      text.slice(m.start, m.end),
    );

  it("finds whole words, whatever their case", () => {
    expect(
      find("The Pageserver and pageservers; a pageserver.", ["pageserver"]),
    ).toEqual(["Pageserver", "pageserver"]);
  });

  it("matches an acronym only as written", () => {
    expect(find("The CAP theorem, not the cap on it.", ["CAP"])).toEqual([
      "CAP",
    ]);
  });

  it("prefers the longer term and never overlaps", () => {
    expect(
      find("A write-ahead log is not a log.", ["write-ahead log", "log"]),
    ).toEqual(["write-ahead log", "log"]);
  });

  it("does not match inside a longer word, and copes with symbols", () => {
    expect(find("Logging and catalogs.", ["log"])).toEqual([]);
    expect(find("Use C++ or c++.", ["C++"])).toEqual(["C++"]);
    expect(find("anything", [])).toEqual([]);
  });
});

describe("gist", () => {
  it("returns a short answer whole", () => {
    expect(gist("Short answer.")).toBe("Short answer.");
  });

  it("keeps whole paragraphs that fit and marks the cut", () => {
    const p1 = "a".repeat(200);
    const p2 = "b".repeat(300);
    expect(gist(`${p1}\n\n${p2}`, 420)).toBe(`${p1} …`);
  });

  it("cuts inside a first paragraph that is itself too long", () => {
    const out = gist("x".repeat(1000), 100);
    expect(out.length).toBeLessThanOrEqual(102);
    expect(out.endsWith("…")).toBe(true);
  });
});

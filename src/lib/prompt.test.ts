import { describe, expect, it } from "vitest";
import { buildPrompt, buildSummaryPrompt } from "@/lib/prompt";
import { makeArticle, p } from "@/test/fixtures";
import type { Highlight } from "@/types/library";

const highlight = (blockIndex: number, text: string): Highlight => ({
  id: "h1",
  articleId: "a1",
  blockIndex,
  startOffset: 0,
  endOffset: text.length,
  text,
});

describe("buildPrompt", () => {
  it("includes title, url, section, selection and the no-tools rule", () => {
    const article = makeArticle([
      { type: "heading", level: 2, text: "Borrowing" },
      p("References borrow a value."),
    ]);
    const prompt = buildPrompt(article, highlight(1, "borrow a value"));
    expect(prompt).toContain("Ownership in Rust (https://example.dev/post)");
    expect(prompt).toContain("Section: Borrowing");
    expect(prompt).toContain('"""\nborrow a value\n"""');
    expect(prompt).toContain("Do not use tools");
    expect(prompt).toContain("Explain the selected passage");
  });

  it("sends the whole article when it is short", () => {
    const article = makeArticle([p("first"), p("middle"), p("last")]);
    const prompt = buildPrompt(article, highlight(1, "middle"));
    expect(prompt).toContain("first");
    expect(prompt).toContain("last");
  });

  it("sends only nearby blocks when the article is long", () => {
    const blocks = Array.from({ length: 200 }, (_, i) =>
      p(`block-${i} ${"x".repeat(100)}`),
    );
    const prompt = buildPrompt(
      makeArticle(blocks),
      highlight(100, "block-100"),
    );
    expect(prompt).toContain("block-100 ");
    expect(prompt).toContain("block-97 "); // 3 before
    expect(prompt).toContain("block-103 "); // 3 after
    expect(prompt).not.toContain("block-0 ");
    expect(prompt).not.toContain("block-199 ");
  });

  it("frames a follow up question instead of a plain explanation", () => {
    const prompt = buildPrompt(
      makeArticle([p("text")]),
      highlight(0, "text"),
      "why?",
    );
    expect(prompt).toContain("follow-up question");
    expect(prompt).toContain("why?");
    expect(prompt).not.toContain("Explain the selected passage");
  });

  it("finds the section heading by walking back from the selection", () => {
    const article = makeArticle([
      { type: "heading", level: 2, text: "A" },
      p("x"),
      { type: "heading", level: 2, text: "B" },
      p("y"),
      p("z"),
    ]);
    expect(buildPrompt(article, highlight(4, "z"))).toContain("Section: B");
  });
});

describe("buildSummaryPrompt", () => {
  it("truncates very long articles and says so", () => {
    const article = makeArticle([p("y".repeat(40000))]);
    const prompt = buildSummaryPrompt(article);
    expect(prompt).toContain("[article truncated]");
    expect(prompt.length).toBeLessThan(31000);
  });

  it("does not mark short articles as truncated", () => {
    expect(buildSummaryPrompt(makeArticle([p("short")]))).not.toContain(
      "truncated",
    );
  });
});

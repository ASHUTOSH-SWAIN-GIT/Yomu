import { describe, expect, it } from "vitest";
import { articleText, blockText } from "@/lib/article-text";
import { p } from "@/test/fixtures";

describe("blockText", () => {
  it("renders lists with nesting and numbering", () => {
    const text = blockText({
      type: "list",
      ordered: true,
      items: [
        { spans: [{ text: "one" }], depth: 0 },
        { spans: [{ text: "nested" }], depth: 1 },
      ],
    });
    expect(text).toBe("1. one\n  2. nested");
  });

  it("renders quotes and tables as Markdown", () => {
    expect(blockText({ type: "quote", spans: [{ text: "a\nb" }] })).toBe(
      "> a\n> b",
    );
    expect(
      blockText({ type: "table", header: ["k", "v"], rows: [["x", "1"]] }),
    ).toBe("| k | v |\n| x | 1 |");
  });

  it("drops images without alt text", () => {
    expect(blockText({ type: "image", src: "x.png", alt: null })).toBe("");
  });
});

describe("articleText", () => {
  it("joins non-empty blocks with blank lines", () => {
    const blocks = [
      p("a"),
      { type: "image" as const, src: "x", alt: null },
      p("b"),
    ];
    expect(articleText(blocks)).toBe("a\n\nb");
  });
});

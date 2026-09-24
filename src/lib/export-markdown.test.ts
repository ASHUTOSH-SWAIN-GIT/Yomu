import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));

import { toMarkdown } from "@/lib/export-markdown";
import { makeArticle, p } from "@/test/fixtures";

describe("toMarkdown", () => {
  it("keeps inline formatting, code fences and tables", () => {
    const article = makeArticle([
      { type: "heading", level: 2, text: "Intro" },
      {
        type: "paragraph",
        spans: [
          { text: "Use " },
          { text: "cargo", code: true },
          { text: " and ", bold: true },
          { text: "docs", href: "https://x.dev" },
        ],
      },
      { type: "code", language: "rust", content: "fn main() {}" },
      { type: "table", header: ["a|b", "c"], rows: [["1", "2"]] },
    ]);
    const md = toMarkdown(article, [], []);
    expect(md).toContain("## Intro");
    expect(md).toContain("Use `cargo`** and **[docs](https://x.dev)");
    expect(md).toContain("```rust\nfn main() {}\n```");
    expect(md).toContain("| a\\|b | c |");
    expect(md).toContain("| --- | --- |");
  });

  it("appends explanations as quotes followed by answers", () => {
    const md = toMarkdown(
      makeArticle([p("body")]),
      ["rust"],
      [
        { role: "user", text: "Explain this", quote: "the passage" },
        { role: "assistant", text: "It means X." },
        { role: "user", text: "Simpler" },
        { role: "assistant", text: "Like Y." },
      ],
    );
    expect(md).toContain("Tags: rust");
    expect(md).toContain("## Explanations");
    expect(md).toContain("> the passage\n\nIt means X.");
    expect(md).toContain("**Simpler**\n\nLike Y.");
  });

  it("has no explanations section when there is no chat", () => {
    expect(toMarkdown(makeArticle([p("body")]), [], [])).not.toContain(
      "Explanations",
    );
  });
});

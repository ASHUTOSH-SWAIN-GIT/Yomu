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
    const prompt = buildPrompt(makeArticle([p("text")]), highlight(0, "text"), {
      question: "why?",
    });
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

describe("buildPrompt for an image", () => {
  const imageHighlight: Highlight = {
    id: "h",
    articleId: "a1",
    blockIndex: 1,
    startOffset: 0,
    endOffset: 0,
    text: "![Pod creation diagram](https://x.dev/pod.png)",
  };
  const article = makeArticle([
    { type: "heading", level: 2, text: "Pods" },
    {
      type: "image",
      src: "https://x.dev/pod.png",
      alt: "Pod creation diagram",
    },
    p("A pod is the smallest deployable unit."),
  ]);

  it("says the image is attached and keeps the surrounding article context", () => {
    const prompt = buildPrompt(article, imageHighlight);
    expect(prompt).toContain("Selected image: Pod creation diagram");
    expect(prompt).toContain("attached");
    expect(prompt).toContain("Section: Pods");
    expect(prompt).toContain("A pod is the smallest deployable unit.");
    expect(prompt).not.toContain('"""');
  });

  it("handles images with no alt text", () => {
    const prompt = buildPrompt(article, {
      ...imageHighlight,
      text: "![](https://x.dev/pod.png)",
    });
    expect(prompt).toContain("(no alt text)");
  });

  it("frames a follow up as being about the image", () => {
    const prompt = buildPrompt(article, imageHighlight, {
      question: "what is the arrow?",
    });
    expect(prompt).toContain("follow-up question about the attached image");
    expect(prompt).toContain("what is the arrow?");
  });
});

describe("buildPrompt question kind", () => {
  const article = makeArticle([p("Some text.")]);
  const h = highlight(0, "Some text.");

  it("frames the first question about a passage as a question, not a follow-up", () => {
    const prompt = buildPrompt(article, h, {
      question: "why?",
      kind: "question",
    });
    expect(prompt).toContain("The developer asks about this passage:\nwhy?");
    expect(prompt).not.toContain("follow-up");
  });

  it("does the same for an image", () => {
    const image: Highlight = { ...h, text: "![d](https://x.dev/d.png)" };
    expect(
      buildPrompt(article, image, {
        question: "what is this?",
        kind: "question",
      }),
    ).toContain("asks about the attached image");
  });
});

describe("buildPrompt table of contents", () => {
  const multi = makeArticle([
    { type: "heading", level: 2, text: "Intro" },
    p("a"),
    { type: "heading", level: 2, text: "Ownership" },
    p("b"),
    { type: "heading", level: 2, text: "Borrowing" },
    p("c"),
  ]);

  it("lists all sections and marks which one the passage is in", () => {
    const prompt = buildPrompt(multi, highlight(3, "b"));
    expect(prompt).toContain("Section 2 of 3");
    expect(prompt).toContain("All sections: Intro, Ownership, Borrowing.");
  });

  it("is omitted for an article with fewer than two headings", () => {
    const single = makeArticle([
      { type: "heading", level: 2, text: "Only" },
      p("x"),
    ]);
    expect(buildPrompt(single, highlight(1, "x"))).not.toContain(
      "All sections",
    );
  });
});

describe("buildPrompt context reuse across a session", () => {
  it("skips resending the full article once the caller says it was already sent", () => {
    const article = makeArticle([p("first"), p("middle"), p("last")]);
    const sent = buildPrompt(article, highlight(1, "middle"), {
      fullContextAlreadySent: true,
    });
    expect(sent).not.toContain("Article context:");
    expect(sent).not.toContain("first");
    // The passage itself and the task are always present regardless.
    expect(sent).toContain('"""\nmiddle\n"""');
  });

  it("still sends nearby blocks for a long article even when marked as sent", () => {
    const blocks = Array.from({ length: 200 }, (_, i) =>
      p(`block-${i} ${"x".repeat(100)}`),
    );
    const prompt = buildPrompt(
      makeArticle(blocks),
      highlight(100, "block-100"),
      {
        fullContextAlreadySent: true,
      },
    );
    expect(prompt).toContain("block-100 ");
    expect(prompt).toContain("Article context:");
  });
});

describe("buildPrompt related articles", () => {
  const article = makeArticle([p("text")]);

  it("lists related articles as secondary, non-authoritative context", () => {
    const prompt = buildPrompt(article, highlight(0, "text"), {
      relatedArticles: [
        {
          articleId: "a2",
          title: "Lifetimes Explained",
          snippet: "closely tied to ownership",
        },
      ],
    });
    expect(prompt).toContain(
      '- "Lifetimes Explained": closely tied to ownership',
    );
    expect(prompt).toContain(
      "Only mention these if they're genuinely relevant",
    );
  });

  it("is omitted entirely when there are none", () => {
    expect(buildPrompt(article, highlight(0, "text"))).not.toContain(
      "other articles the developer has saved",
    );
  });

  it("lists several related articles in order", () => {
    const prompt = buildPrompt(article, highlight(0, "text"), {
      relatedArticles: [
        { articleId: "a2", title: "First", snippet: "one" },
        { articleId: "a3", title: "Second", snippet: "two" },
      ],
    });
    expect(prompt.indexOf("First")).toBeLessThan(prompt.indexOf("Second"));
  });
});

describe("buildPrompt personalization", () => {
  const article = makeArticle([p("text")]);

  it("appends personalization notes after the task instruction", () => {
    const prompt = buildPrompt(article, highlight(0, "text"), {
      personalizationNotes: [
        "The developer is new to this topic: explain plainly.",
      ],
    });
    expect(prompt).toContain("Explain the selected passage");
    expect(prompt).toContain(
      "The developer is new to this topic: explain plainly.",
    );
    expect(prompt.indexOf("Explain the selected passage")).toBeLessThan(
      prompt.indexOf("new to this topic"),
    );
  });

  it("appends after a follow-up question too, not just the default task", () => {
    const prompt = buildPrompt(article, highlight(0, "text"), {
      question: "why?",
      personalizationNotes: ["Always include a short code example."],
    });
    expect(prompt).toContain("follow-up question about this passage:\nwhy?");
    expect(prompt).toContain("Always include a short code example.");
  });

  it("adds nothing when there are no notes", () => {
    expect(buildPrompt(article, highlight(0, "text"))).not.toContain(
      "The developer is",
    );
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

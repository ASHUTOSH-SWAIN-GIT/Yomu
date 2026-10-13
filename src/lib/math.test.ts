import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inlineMathHtml } from "@/lib/math";
import { SpanText } from "@/components/reader/paragraph-block";

describe("inlineMathHtml", () => {
  it("typesets TeX with KaTeX, without a second MathML copy", () => {
    const html = inlineMathHtml(String.raw`0.7 \times C`);
    expect(html).toContain('class="katex"');
    expect(html).toContain("×");
    expect(html).not.toContain("<math");
    expect(html).not.toContain(String.raw`\times`);
  });

  it("keeps braces in numbers readable", () => {
    expect(inlineMathHtml("C = 8{,}192")).toContain("8");
  });

  it("shows bad TeX as KaTeX's error text instead of throwing", () => {
    const html = inlineMathHtml(String.raw`\notacommand{`);
    expect(html).toContain("katex-error");
  });
});

describe("SpanText with math", () => {
  const render = (span: Parameters<typeof SpanText>[0]["span"]) =>
    renderToStaticMarkup(createElement(SpanText, { span }));

  it("renders a math span as typeset math, labelled with its TeX", () => {
    const html = render({ text: String.raw`0.7 \times C`, math: true });
    expect(html).toContain('class="katex"');
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-label");
    expect(html).not.toContain(String.raw`\(`);
  });

  it("keeps bold and links around math", () => {
    const bold = render({ text: "x", math: true, bold: true });
    expect(bold).toContain("font-semibold");
    const link = render({ text: "x", math: true, href: "https://x.dev" });
    expect(link).toContain('href="https://x.dev"');
    expect(link).toContain('class="katex"');
  });

  it("leaves ordinary text alone", () => {
    expect(render({ text: "plain" })).toBe("<span>plain</span>");
    expect(render({ text: "a\nb" })).toContain("<br/>");
    expect(render({ text: "no math here" })).not.toContain("katex");
  });
});

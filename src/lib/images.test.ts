import { describe, expect, it } from "vitest";
import {
  imageQuote,
  isRemoteImage,
  isSvgUrl,
  parseImageQuote,
  resolveImageUrl,
} from "@/lib/images";

describe("isRemoteImage", () => {
  it.each([
    ["https://cdn.example.com/a.png", true],
    ["http://example.com/a.png", true],
    ["//cdn.example.com/a.png", true],
    ["  HTTPS://EXAMPLE.COM/A.PNG", true],
    ["data:image/png;base64,AAAA", false],
    ["/static/a.png", false],
    ["a.png", false],
  ])("%s -> %s", (src, expected) => {
    expect(isRemoteImage(src)).toBe(expected);
  });
});

describe("resolveImageUrl", () => {
  const page = "https://site.dev/docs/guide/page.html";

  it("resolves relative and protocol-relative URLs against the article", () => {
    expect(resolveImageUrl("/images/a.png", page)).toBe(
      "https://site.dev/images/a.png",
    );
    expect(resolveImageUrl("rel.png", page)).toBe(
      "https://site.dev/docs/guide/rel.png",
    );
    expect(resolveImageUrl("//cdn.x/b.png", page)).toBe("https://cdn.x/b.png");
  });

  it("leaves absolute and data URLs alone", () => {
    expect(resolveImageUrl("https://cdn.x/c.png", page)).toBe(
      "https://cdn.x/c.png",
    );
    expect(resolveImageUrl("data:image/png;base64,AAAA", page)).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("returns the input when it cannot be resolved", () => {
    expect(resolveImageUrl("/x.png", "not a url")).toBe("/x.png");
  });
});

describe("imageUrlsOf", () => {
  it("returns unique absolute http(s) urls in reading order", async () => {
    const { imageUrlsOf } = await import("@/lib/images");
    const { makeArticle } = await import("@/test/fixtures");
    const article = makeArticle([
      { type: "image", src: "/a.png", alt: null },
      { type: "paragraph", spans: [{ text: "x" }] },
      { type: "image", src: "https://cdn.x/b.png", alt: null },
      { type: "image", src: "/a.png", alt: null },
      { type: "image", src: "data:image/png;base64,AAAA", alt: null },
    ]);
    expect(imageUrlsOf(article)).toEqual([
      "https://example.dev/a.png",
      "https://cdn.x/b.png",
    ]);
  });
});

describe("image quotes", () => {
  it("round-trips an image and its alt text", () => {
    const quote = imageQuote("Pod creation diagram", "https://k8s.io/pod.png");
    expect(quote).toBe("![Pod creation diagram](https://k8s.io/pod.png)");
    expect(parseImageQuote(quote)).toEqual({
      alt: "Pod creation diagram",
      src: "https://k8s.io/pod.png",
    });
  });

  it("copes with missing alt text and brackets in it", () => {
    expect(parseImageQuote(imageQuote(null, "https://x/a.png"))).toEqual({
      alt: "",
      src: "https://x/a.png",
    });
    expect(parseImageQuote(imageQuote("a [b] c", "https://x/a.png"))?.alt).toBe(
      "a b c",
    );
  });

  it("does not mistake ordinary selected text for an image", () => {
    expect(parseImageQuote("Each value has one owner.")).toBeNull();
    expect(parseImageQuote("see ![x](https://a/b.png) here")).toBeNull();
  });
});

describe("isSvgUrl", () => {
  it.each([
    ["https://k8s.io/images/pod.svg", true],
    ["https://k8s.io/images/pod.SVG?v=2", true],
    ["https://wikimedia.org/x.svg/500px-x.svg.png", false], // a PNG rendering
    ["https://cdn.x/a.png", false],
  ])("%s -> %s", (src, expected) => {
    expect(isSvgUrl(src)).toBe(expected);
  });
});

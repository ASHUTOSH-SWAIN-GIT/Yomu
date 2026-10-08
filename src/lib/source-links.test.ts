import { describe, expect, it } from "vitest";
import { parseSourceHref, sourceHref } from "@/lib/source-links";

describe("source links", () => {
  it("reads a blog with a paragraph, and one without", () => {
    expect(parseSourceHref("yomu:abc-123#7")).toEqual({
      id: "abc-123",
      block: 7,
    });
    expect(parseSourceHref("yomu:abc-123")).toEqual({
      id: "abc-123",
      block: null,
    });
  });

  it("ignores anything else, so an ordinary link stays ordinary", () => {
    expect(parseSourceHref("https://example.dev")).toBeNull();
    expect(parseSourceHref("yomu:")).toBeNull();
    expect(parseSourceHref("yomu:a b")).toBeNull();
    expect(parseSourceHref("yomu:abc#x")).toBeNull();
    expect(parseSourceHref("javascript:alert(1)")).toBeNull();
    expect(parseSourceHref(undefined)).toBeNull();
  });

  it("builds what it reads", () => {
    expect(parseSourceHref(sourceHref("a1", 3))).toEqual({
      id: "a1",
      block: 3,
    });
    expect(sourceHref("a1")).toBe("yomu:a1");
  });
});

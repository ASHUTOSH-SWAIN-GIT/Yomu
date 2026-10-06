import { describe, expect, it } from "vitest";
import {
  COMMENT_ROOM,
  commentLayout,
  currentHeadingIndex,
} from "@/lib/reader-layout";

describe("commentLayout", () => {
  it("keeps the article centred when both sides have room", () => {
    expect(commentLayout(2 * COMMENT_ROOM)).toEqual({
      beside: true,
      left: null,
    });
  });

  it("slides the article left by just what the comments need", () => {
    expect(commentLayout(COMMENT_ROOM + 100)).toEqual({
      beside: true,
      left: 100,
    });
    // The article keeps at least 16px on its left.
    expect(commentLayout(COMMENT_ROOM + 16)).toEqual({
      beside: true,
      left: 16,
    });
  });

  it("puts comments under their paragraph when the window is too narrow", () => {
    expect(commentLayout(COMMENT_ROOM + 15)).toEqual({
      beside: false,
      left: null,
    });
    expect(commentLayout(0)).toEqual({ beside: false, left: null });
  });
});

describe("currentHeadingIndex", () => {
  it("is the last heading that has reached the limit", () => {
    expect(currentHeadingIndex([-300, -50, 90, 400], 120)).toBe(2);
  });

  it("is the first heading before any has been reached", () => {
    expect(currentHeadingIndex([200, 600], 120)).toBe(0);
  });

  it("skips headings that are not on the page", () => {
    expect(currentHeadingIndex([10, null, 500], 120)).toBe(0);
  });

  it("is 0 with no headings", () => {
    expect(currentHeadingIndex([], 120)).toBe(0);
  });
});

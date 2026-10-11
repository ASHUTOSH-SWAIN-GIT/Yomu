import { describe, expect, it } from "vitest";
import {
  pageOfBlock,
  pageOfProgress,
  paperPages,
  progressOfPage,
} from "@/lib/pdf/pages";
import type { Block } from "@/types/article";

const para = (text: string, page?: number): Block => ({
  type: "paragraph",
  spans: [{ text }],
  ...(page === undefined ? {} : { page }),
});

describe("paper pages", () => {
  it("follows the PDF's own pages", () => {
    const blocks = [para("a", 1), para("b", 1), para("c", 2), para("d", 4)];
    expect(paperPages(blocks)).toEqual([
      { number: 1, start: 0, end: 2 },
      { number: 2, start: 2, end: 3 },
      { number: 4, start: 3, end: 4 },
    ]);
  });

  it("keeps a block without a page on the page before it", () => {
    const blocks = [para("a", 1), para("b"), para("c", 2)];
    expect(paperPages(blocks).map((p) => [p.start, p.end])).toEqual([
      [0, 2],
      [2, 3],
    ]);
  });

  it("makes pages of about a page of text when pages are not known", () => {
    const long = "x".repeat(2000);
    const blocks = [para(long), para(long), para(long), para(long)];
    const pages = paperPages(blocks);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.number)).toEqual([1, 2]);
    expect(pages[1].end).toBe(4);
  });

  it("starts a page at a heading when the page is mostly full", () => {
    const blocks: Block[] = [
      para("x".repeat(2500)),
      { type: "heading", level: 2, text: "2 Model" },
      para("y"),
    ];
    expect(paperPages(blocks).map((p) => p.start)).toEqual([0, 1]);
  });

  it("has no pages for no blocks", () => {
    expect(paperPages([])).toEqual([]);
  });

  it("finds the page of a block", () => {
    const pages = paperPages([para("a", 1), para("b", 2), para("c", 2)]);
    expect(pageOfBlock(pages, 0)).toBe(0);
    expect(pageOfBlock(pages, 2)).toBe(1);
    expect(pageOfBlock(pages, 99)).toBe(0);
  });

  it("turns progress into a page and back", () => {
    expect(progressOfPage(0, 10)).toBe(0.1);
    expect(progressOfPage(9, 10)).toBe(1);
    expect(progressOfPage(0, 1)).toBe(1);
    for (let i = 0; i < 10; i++) {
      expect(pageOfProgress(progressOfPage(i, 10), 10)).toBe(i);
    }
    expect(pageOfProgress(0, 10)).toBe(0);
    expect(pageOfProgress(0.37, 10)).toBe(3);
    expect(pageOfProgress(5, 10)).toBe(9);
  });
});

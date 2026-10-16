import { describe, expect, it } from "vitest";
import { marksHit } from "@/lib/text-ranges";

const marks = [
  { id: "a", blockIndex: 1, start: 5, end: 10 },
  { id: "b", blockIndex: 2, start: 5, end: 10 },
];

describe("marksHit", () => {
  it("finds a highlight under a click", () => {
    const at = { blockIndex: 1, start: 7, end: 7 };
    expect(marksHit(marks, at).map((m) => m.id)).toEqual(["a"]);
  });

  it("finds a highlight a selection overlaps", () => {
    const at = { blockIndex: 1, start: 8, end: 20 };
    expect(marksHit(marks, at).map((m) => m.id)).toEqual(["a"]);
  });

  it("ignores other blocks and touching edges", () => {
    expect(marksHit(marks, { blockIndex: 3, start: 5, end: 10 })).toEqual([]);
    expect(marksHit(marks, { blockIndex: 1, start: 10, end: 10 })).toEqual([]);
    expect(marksHit(marks, { blockIndex: 1, start: 0, end: 5 })).toEqual([]);
  });
});

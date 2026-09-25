import { describe, expect, it } from "vitest";
import { readingMinutes } from "@/lib/reading";
import { p } from "@/test/fixtures";

describe("readingMinutes", () => {
  it("is at least one minute, even for an empty article", () => {
    expect(readingMinutes([])).toBe(1);
    expect(readingMinutes([p("just a few words")])).toBe(1);
  });

  it("scales with length (about 220 words a minute)", () => {
    const words = (n: number) => Array(n).fill("word").join(" ");
    expect(readingMinutes([p(words(2200))])).toBe(10);
    expect(readingMinutes([p(words(1100)), p(words(1100))])).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { firstSentence } from "@/lib/text";

describe("firstSentence", () => {
  it("stops at the first sentence terminator", () => {
    expect(
      firstSentence("Ownership means one owner. It moves on assignment."),
    ).toBe("Ownership means one owner.");
    expect(firstSentence("Is it moved? Yes, always.")).toBe("Is it moved?");
    expect(firstSentence("Watch out! It moves.")).toBe("Watch out!");
  });

  it("collapses whitespace before measuring", () => {
    expect(firstSentence("Line one\n\nstill  one sentence.   More.")).toBe(
      "Line one still one sentence.",
    );
  });

  it("falls back to the whole text when there is no terminator", () => {
    expect(firstSentence("no terminator here")).toBe("no terminator here");
  });

  it("caps very long sentences with an ellipsis", () => {
    const long = "x".repeat(200) + ".";
    const result = firstSentence(long, 140);
    expect(result.length).toBe(140);
    expect(result.endsWith("…")).toBe(true);
  });
});

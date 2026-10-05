import { describe, expect, it } from "vitest";
import { joinWords, splitWords } from "@/lib/shell-words";

describe("splitWords", () => {
  it("splits on spaces and keeps quoted spaces together", () => {
    expect(splitWords("--acp --dir 'my folder' \"a b\" c")).toEqual([
      "--acp",
      "--dir",
      "my folder",
      "a b",
      "c",
    ]);
  });

  it("handles empty input and extra spaces", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("   a    b  ")).toEqual(["a", "b"]);
    expect(splitWords('""')).toEqual([""]);
  });
});

describe("joinWords", () => {
  it("round-trips through splitWords", () => {
    const words = ["--flag", "two words", "plain", ""];
    expect(splitWords(joinWords(words))).toEqual(words);
  });
});

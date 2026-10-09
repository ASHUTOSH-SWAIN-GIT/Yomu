import { describe, expect, it } from "vitest";
import {
  ARTICLE_COMMANDS,
  LIBRARY_COMMANDS,
  matchCommands,
} from "@/lib/slash-commands";
import { articleInstruction } from "@/lib/quick-actions";

describe("matchCommands", () => {
  it("offers everything for a bare slash", () => {
    expect(matchCommands("/", ARTICLE_COMMANDS)).toEqual(ARTICLE_COMMANDS);
  });

  it("narrows by what is typed, ignoring case", () => {
    expect(matchCommands("/SUM", ARTICLE_COMMANDS).map((c) => c.name)).toEqual([
      "summarize",
    ]);
    expect(matchCommands("/q", ARTICLE_COMMANDS).map((c) => c.name)).toEqual([
      "quiz",
    ]);
  });

  it("offers nothing once the text is a sentence, or not about commands", () => {
    expect(matchCommands("/summarize this", ARTICLE_COMMANDS)).toEqual([]);
    expect(matchCommands("hello /quiz", ARTICLE_COMMANDS)).toEqual([]);
    expect(matchCommands("", ARTICLE_COMMANDS)).toEqual([]);
    expect(matchCommands("/zzz", ARTICLE_COMMANDS)).toEqual([]);
  });
});

describe("the commands themselves", () => {
  it("have unique names", () => {
    for (const list of [ARTICLE_COMMANDS, LIBRARY_COMMANDS]) {
      const names = list.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((n) => /^[\w-]+$/.test(n))).toBe(true);
    }
  });

  it("send a quick action's stored message, which maps back to its full instruction", () => {
    const summarize = ARTICLE_COMMANDS.find((c) => c.name === "summarize")!;
    expect(articleInstruction(summarize.text)).not.toBe(summarize.text);
  });
});

import { describe, expect, it } from "vitest";
import {
  ARTICLE_ACTIONS,
  PASSAGE_ACTIONS,
  articleInstruction,
} from "@/lib/quick-actions";

describe("articleInstruction", () => {
  it("maps every article quick action's stored message back to its prompt", () => {
    for (const a of ARTICLE_ACTIONS) {
      expect(articleInstruction(a.message)).toBe(a.prompt);
    }
  });

  it("sends a free-form question as is", () => {
    expect(articleInstruction("Why does it matter?")).toBe(
      "Why does it matter?",
    );
  });

  it("keeps stored messages distinct so a question can be told from an action", () => {
    const messages = ARTICLE_ACTIONS.map((a) => a.message);
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe("PASSAGE_ACTIONS", () => {
  it("asks with the same text it shows as the question", () => {
    for (const a of PASSAGE_ACTIONS) expect(a.message).toBe(a.prompt);
  });
});

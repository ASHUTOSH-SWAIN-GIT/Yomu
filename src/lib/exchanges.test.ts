import { describe, expect, it } from "vitest";
import { groupExchanges, pickExchange } from "@/lib/exchanges";
import type { ChatMessage } from "@/stores/chat-store";

const u = (text: string, highlightId?: string): ChatMessage => ({
  role: "user",
  text,
  highlightId,
});
const a = (text: string): ChatMessage => ({ role: "assistant", text });

describe("groupExchanges", () => {
  it("pairs each question with its answers", () => {
    const groups = groupExchanges([
      u("q1", "h1"),
      a("a1"),
      u("q2"),
      a("a2"),
      a("a2b"),
    ]);
    expect(
      groups.map((g) => [g.question.text, g.answers.map((x) => x.text)]),
    ).toEqual([
      ["q1", ["a1"]],
      ["q2", ["a2", "a2b"]],
    ]);
  });

  it("keeps a question that has no answer yet (still streaming)", () => {
    expect(groupExchanges([u("q1")])).toEqual([
      { question: u("q1"), answers: [] },
    ]);
  });

  it("ignores stray assistant messages and handles an empty chat", () => {
    expect(groupExchanges([a("orphan"), u("q")])).toHaveLength(1);
    expect(groupExchanges([])).toEqual([]);
  });
});

describe("pickExchange", () => {
  const groups = groupExchanges([
    u("q1", "h1"),
    a("a1"),
    u("q2", "h2"),
    a("a2"),
  ]);

  it("shows the latest by default and the focused highlight's when asked", () => {
    expect(pickExchange(groups, null)?.question.text).toBe("q2");
    expect(pickExchange(groups, "h1")?.question.text).toBe("q1");
  });

  it("falls back to the latest for an unknown highlight, and to null when empty", () => {
    expect(pickExchange(groups, "nope")?.question.text).toBe("q2");
    expect(pickExchange([], "h1")).toBeNull();
  });
});

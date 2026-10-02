import { describe, expect, it } from "vitest";
import {
  groupExchanges,
  pickExchange,
  priorExplanations,
} from "@/lib/exchanges";
import type { ChatMessage } from "@/stores/chat-store";

const u = (text: string, highlightId?: string): ChatMessage => ({
  role: "user",
  text,
  highlightId,
});
const a = (text: string): ChatMessage => ({ role: "assistant", text });

/** A user message that asked about a highlighted passage, the shape
 * `priorExplanations` looks for. */
const asked = (
  highlightId: string,
  quote: string,
  text = "Explain this",
): ChatMessage => ({
  role: "user",
  text,
  highlightId,
  quote,
});

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

describe("priorExplanations", () => {
  it("gists each earlier, answered passage-question, excluding the current one", () => {
    const messages = [
      asked("h1", "Each value has one owner."),
      a("Ownership means exactly one owner. It moves on assignment."),
      asked("h2", "Borrowing lends access."),
      a("Borrowing avoids a copy. It uses a reference."),
      asked("h3", "The passage being asked about right now."),
    ];
    const result = priorExplanations(messages, "h3");
    expect(result).toEqual([
      {
        quote: "Each value has one owner.",
        summary: "Ownership means exactly one owner.",
      },
      { quote: "Borrowing lends access.", summary: "Borrowing avoids a copy." },
    ]);
  });

  it("excludes summaries, plain follow-ups, unanswered questions and image questions", () => {
    const messages = [
      {
        role: "user" as const,
        text: "Summarize this article",
        scope: "article" as const,
      },
      a("Summary answer."),
      { role: "user" as const, text: "a plain follow up, no highlight" },
      a("Follow-up answer."),
      asked("h4", "![a diagram](https://x.dev/d.png)"), // image question
      a("It shows a diagram."),
      asked("h5", "Still being answered"), // no answer yet
    ];
    expect(priorExplanations(messages, undefined)).toEqual([]);
  });

  it("keeps only the most recent `limit` entries", () => {
    const messages = Array.from({ length: 8 }, (_, i) => [
      asked(`h${i}`, `passage ${i}`),
      a(`answer ${i}.`),
    ]).flat();
    const result = priorExplanations(messages, undefined, 3);
    expect(result.map((r) => r.quote)).toEqual([
      "passage 5",
      "passage 6",
      "passage 7",
    ]);
  });

  it("uses the last answer when a passage was regenerated (several answers)", () => {
    const messages = [
      asked("h1", "quote"),
      a("first answer."),
      a("better answer."),
    ];
    expect(priorExplanations(messages, undefined)).toEqual([
      { quote: "quote", summary: "better answer." },
    ]);
  });
});

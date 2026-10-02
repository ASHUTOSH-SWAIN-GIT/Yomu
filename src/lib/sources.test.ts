import { describe, expect, it } from "vitest";
import { citedArticles } from "@/lib/sources";

const articles = [
  { id: "a", title: "Rust ownership" },
  { id: "b", title: "Go generics" },
  { id: "c", title: "Intro" },
  { id: "d", title: "Postgres storage" },
];

describe("citedArticles", () => {
  it("returns saved articles whose titles appear in the answer, in order", () => {
    const answer =
      'See "Go generics" for type parameters, and "Rust ownership" for moves.';
    expect(citedArticles(answer, articles).map((a) => a.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("ignores case", () => {
    expect(citedArticles("from rust OWNERSHIP", articles)).toEqual([
      { id: "a", title: "Rust ownership" },
    ]);
  });

  it("never links a title that is not a saved article", () => {
    expect(citedArticles('As in "Made Up Article".', articles)).toEqual([]);
  });

  it("skips titles too short to be a reliable match", () => {
    expect(citedArticles("An intro to the topic", articles)).toEqual([]);
  });

  it("returns nothing for an empty answer", () => {
    expect(citedArticles("", articles)).toEqual([]);
  });
});

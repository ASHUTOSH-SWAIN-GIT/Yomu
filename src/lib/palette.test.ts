import { describe, expect, it } from "vitest";
import { filterByQuery, matchesQuery } from "@/lib/palette";

describe("matchesQuery", () => {
  it("requires every word, in any order, ignoring case", () => {
    expect(matchesQuery("Toggle focus mode", "focus toggle")).toBe(true);
    expect(matchesQuery("Toggle focus mode", "FOCUS")).toBe(true);
    expect(matchesQuery("Toggle focus mode", "focus theme")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery("anything", "   ")).toBe(true);
  });
});

describe("filterByQuery", () => {
  const actions = [
    { label: "New tab" },
    { label: "Night theme" },
    { label: "Focus mode" },
  ];

  it("filters by the given text and keeps everything when the query is empty", () => {
    expect(filterByQuery(actions, "e", (a) => a.label)).toHaveLength(3);
    expect(filterByQuery(actions, "night", (a) => a.label)).toEqual([
      { label: "Night theme" },
    ]);
    expect(filterByQuery(actions, "", (a) => a.label)).toBe(actions);
  });
});

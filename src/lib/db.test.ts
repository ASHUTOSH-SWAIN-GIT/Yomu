import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

import { normalizeTag, toMatchQuery, toRelatedQuery } from "@/lib/db";

describe("toMatchQuery", () => {
  it("quotes each word as a prefix match, all required", () => {
    expect(toMatchQuery("rust own")).toBe('"rust"* "own"*');
  });

  it("neutralizes FTS syntax typed by the user", () => {
    // OR, NEAR, column filters and quotes must not reach FTS5 as operators.
    const q = toMatchQuery('foo OR "bar" NEAR(a b) text:x');
    expect(q).not.toContain("NEAR(");
    expect(q).toBe('"foo"* "OR"* "bar"* "NEAR"* "a"* "b"* "text"* "x"*');
  });

  it("supports non-latin text", () => {
    expect(toMatchQuery("café 日本語")).toBe('"café"* "日本語"*');
  });

  it("returns null when there is nothing searchable", () => {
    expect(toMatchQuery("  ")).toBeNull();
    expect(toMatchQuery('"*()')).toBeNull();
  });
});

describe("toRelatedQuery", () => {
  it("ORs distinctive words instead of requiring every word (unlike toMatchQuery)", () => {
    const q = toRelatedQuery("Ownership and borrowing in Rust");
    expect(q).toContain(" OR ");
    expect(q).toBe('"Ownership"* OR "borrowing"* OR "Rust"*');
  });

  it("drops short and filler words, and de-duplicates", () => {
    const q = toRelatedQuery("the value is the value and it is owned");
    expect(q).toBe('"value"* OR "owned"*');
  });

  it("caps how many terms it uses for a very long passage", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const q = toRelatedQuery(words, 5);
    expect(q?.split(" OR ")).toHaveLength(5);
  });

  it("is safe against FTS syntax and returns null for nothing searchable", () => {
    expect(toRelatedQuery('OR NEAR(a b) "quoted"')).not.toContain("NEAR(");
    expect(toRelatedQuery("a an is the")).toBeNull();
    expect(toRelatedQuery("   ")).toBeNull();
  });
});

describe("normalizeTag", () => {
  it("lowercases, hyphenates and caps length", () => {
    expect(normalizeTag("  Machine Learning ")).toBe("machine-learning");
    expect(normalizeTag("x".repeat(50))).toHaveLength(32);
    expect(normalizeTag("   ")).toBe("");
  });
});

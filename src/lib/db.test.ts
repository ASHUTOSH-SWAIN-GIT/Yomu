import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

import { normalizeTag, toMatchQuery } from "@/lib/db";

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

describe("normalizeTag", () => {
  it("lowercases, hyphenates and caps length", () => {
    expect(normalizeTag("  Machine Learning ")).toBe("machine-learning");
    expect(normalizeTag("x".repeat(50))).toHaveLength(32);
    expect(normalizeTag("   ")).toBe("");
  });
});

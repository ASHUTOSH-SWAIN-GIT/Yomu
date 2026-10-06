import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPLAIN_PREFS,
  STYLE_MAX,
  styleInstruction,
  codeExamplesInstruction,
  explainPrefInstructions,
  levelInstruction,
  parseExplainPrefs,
} from "@/lib/explain-prefs";

describe("parseExplainPrefs", () => {
  it("returns defaults for missing or corrupt storage", () => {
    expect(parseExplainPrefs(null)).toEqual(DEFAULT_EXPLAIN_PREFS);
    expect(parseExplainPrefs("{not json")).toEqual(DEFAULT_EXPLAIN_PREFS);
    expect(parseExplainPrefs("42")).toEqual(DEFAULT_EXPLAIN_PREFS);
  });

  it("keeps valid fields and replaces invalid ones individually", () => {
    expect(
      parseExplainPrefs(
        JSON.stringify({ level: "expert", codeExamples: "nonsense" }),
      ),
    ).toEqual({ level: "expert", codeExamples: "helpful", style: "" });
  });
});

describe("levelInstruction", () => {
  it("has no extra instruction for balanced, the default", () => {
    expect(levelInstruction("balanced")).toBeNull();
  });

  it("gives distinct instructions for beginner and expert", () => {
    expect(levelInstruction("beginner")).toContain("new to this topic");
    expect(levelInstruction("expert")).toContain("experienced");
  });
});

describe("codeExamplesInstruction", () => {
  it("has no extra instruction for 'helpful', the default", () => {
    expect(codeExamplesInstruction("helpful")).toBeNull();
  });

  it("gives distinct instructions for always and never", () => {
    expect(codeExamplesInstruction("always")).toContain("Always include");
    expect(codeExamplesInstruction("never")).toContain("Do not include");
  });
});

describe("explainPrefInstructions", () => {
  it("is empty for the default preferences", () => {
    expect(explainPrefInstructions(DEFAULT_EXPLAIN_PREFS)).toEqual([]);
  });

  it("combines both instructions when both are non-default", () => {
    const lines = explainPrefInstructions({
      level: "beginner",
      codeExamples: "always",
      style: "",
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("new to this topic");
    expect(lines[1]).toContain("Always include");
  });
});

describe("answer style", () => {
  it("is passed on as written, and ignored when empty", () => {
    expect(styleInstruction("  be thorough  ")).toContain("be thorough");
    expect(styleInstruction("   ")).toBeNull();
    expect(
      explainPrefInstructions({ ...DEFAULT_EXPLAIN_PREFS, style: "in Hindi" }),
    ).toEqual([expect.stringContaining("in Hindi")]);
  });

  it("is trimmed and capped when read back", () => {
    const long = "x".repeat(STYLE_MAX + 50);
    expect(
      parseExplainPrefs(JSON.stringify({ style: ` ${long} ` })).style,
    ).toHaveLength(STYLE_MAX);
    expect(parseExplainPrefs(JSON.stringify({ style: 5 })).style).toBe("");
  });
});

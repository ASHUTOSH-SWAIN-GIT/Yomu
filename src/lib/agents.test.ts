import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE,
  GEMINI,
  OPENCODE,
  PRESETS,
  presetOf,
  upgradeSaved,
} from "@/lib/agents";

describe("agent presets", () => {
  it("each start differently, so one is never mistaken for another", () => {
    const lines = PRESETS.map(
      (p) => `${p.config.command} ${p.config.args.join(" ")}`,
    );
    expect(new Set(lines).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it("recognises a preset from the configuration saved for it", () => {
    expect(presetOf(OPENCODE.config)).toBe(OPENCODE);
    expect(presetOf(CLAUDE_CODE.config)).toBe(CLAUDE_CODE);
    expect(presetOf(GEMINI.config)).toBe(GEMINI);
  });

  it("treats Codex and a hand-made agent as no preset", () => {
    expect(presetOf({ kind: "codex" })).toBeUndefined();
    expect(
      presetOf({ kind: "custom", command: "my-agent", args: [], dataDirs: [] }),
    ).toBeUndefined();
  });

  it("gives Claude Code the Keychain and its settings file for signing in", () => {
    expect(CLAUDE_CODE.config.dataDirs).toEqual(
      expect.arrayContaining(["~/.claude.json", "~/Library/Keychains"]),
    );
  });
});

describe("upgradeSaved", () => {
  it("brings the first saved Claude Code choice up to date", () => {
    const first = {
      kind: "custom" as const,
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp@0.86.0"],
      dataDirs: ["~/.claude"],
    };
    expect(upgradeSaved(first)).toBe(CLAUDE_CODE.config);
  });

  it("leaves everything else as it is", () => {
    const mine = {
      kind: "custom" as const,
      command: "npx",
      args: ["-y", "some-other-agent"],
      dataDirs: [],
    };
    expect(upgradeSaved(mine)).toBe(mine);
    expect(upgradeSaved({ kind: "codex" })).toEqual({ kind: "codex" });
    expect(upgradeSaved(GEMINI.config)).toBe(GEMINI.config);
  });
});

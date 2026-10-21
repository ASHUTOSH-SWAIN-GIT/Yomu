import { describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/lib/storage", () => ({
  readStorage: () => saved.value,
  writeStorage: (_: string, v: string) => void (saved.value = v),
}));

import {
  CLAUDE_CODE,
  OPENCODE,
  CUSTOM_ID,
  agentId,
  agentLabel,
  PRESETS,
  readEnabled,
  writeEnabled,
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
  });
});

describe("turning agents on", () => {
  it("starts with nothing on, Codex included", () => {
    saved.value = null;
    expect(readEnabled({ kind: "codex" })).toEqual([]);
  });

  it("remembers what was turned on", () => {
    writeEnabled([OPENCODE.id]);
    expect(readEnabled({ kind: "codex" })).toEqual([OPENCODE.id]);
  });

  it("counts the agent already in use, so existing users are not asked", () => {
    saved.value = null;
    expect(readEnabled(CLAUDE_CODE.config)).toEqual([CLAUDE_CODE.id]);
    expect(
      readEnabled({ kind: "custom", command: "x", args: [], dataDirs: [] }),
    ).toEqual([CUSTOM_ID]);
  });

  it("ignores a corrupt saved value", () => {
    saved.value = "{nope";
    expect(readEnabled({ kind: "codex" })).toEqual([]);
  });
});

describe("agent names", () => {
  it("tells Codex, presets and hand-made agents apart", () => {
    expect(agentId({ kind: "codex" })).toBe("codex");
    expect(agentId(OPENCODE.config)).toBe("opencode");
    expect(
      agentId({ kind: "custom", command: "x", args: [], dataDirs: [] }),
    ).toBe("custom");
    expect(agentLabel({ kind: "codex" })).toBe("Codex");
    expect(agentLabel(CLAUDE_CODE.config)).toBe("Claude Code");
    expect(
      agentLabel({
        kind: "custom",
        command: "/bin/my-agent",
        args: [],
        dataDirs: [],
      }),
    ).toBe("my-agent");
  });
});

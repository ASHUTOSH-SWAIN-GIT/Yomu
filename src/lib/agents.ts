import { readStorage, writeStorage } from "@/lib/storage";
import type { AgentConfig } from "@/types/agent";

type CustomAgent = Extract<AgentConfig, { kind: "custom" }>;

/** An agent Yomu knows how to start, beyond Codex: the command and the
 * folders it needs in the sandbox, ready to pick in Settings. */
export interface AgentPreset {
  id: string;
  label: string;
  config: CustomAgent;
  /** The program whose presence on this computer means the agent is set up. */
  detect: string;
  /** What it is, when it was found. */
  note: string;
  /** What to do when it was not found. */
  missing: string;
}

/** OpenCode, started as `opencode acp`, with the folders it keeps its
 * sign-in, settings, history and cache in. */
export const OPENCODE: AgentPreset = {
  id: "opencode",
  label: "OpenCode",
  detect: "opencode",
  note: "Your local OpenCode, with whichever provider and model you have set up in it.",
  missing:
    "Not found on this computer. Install OpenCode, then sign in with `opencode auth login`.",
  config: {
    kind: "custom",
    command: "opencode",
    args: ["acp"],
    dataDirs: [
      "~/.local/share/opencode",
      "~/.local/state/opencode",
      "~/.cache/opencode",
      "~/.config/opencode",
    ],
  },
};

/** Claude Code, through the ACP adapter (run with npx, so Node.js is
 * needed). On a Mac its sign-in lives in the Keychain and `~/.claude.json`,
 * so the sandbox has to let it use those. Tried for real: it signs in and
 * answers with exactly these folders.
 *
 * It keeps its own npm cache (inside `~/.npm`, which the sandbox lets it
 * write): a shared cache that has a folder owned by root (left by an old
 * `sudo npm`) makes npx fail to download the adapter. */
export const CLAUDE_CODE: AgentPreset = {
  id: "claude-code",
  label: "Claude Code",
  detect: "claude",
  note: "Your local Claude Code, signed in with your Claude plan. Needs Node.js, and access to your Keychain for the sign-in.",
  missing:
    "Not found on this computer. Install Claude Code, then sign in by running `claude` once.",
  config: {
    kind: "custom",
    command: "npx",
    args: [
      "--cache",
      "~/.npm/_yomu-claude",
      "-y",
      "@agentclientprotocol/claude-agent-acp@0.86.0",
    ],
    dataDirs: ["~/.claude", "~/.claude.json", "~/Library/Keychains"],
  },
};

export const PRESETS: AgentPreset[] = [CLAUDE_CODE, OPENCODE];

/** A saved choice made before a preset changed, brought up to date: Claude
 * Code was first saved without its own npm cache. Anything else is returned
 * as it is. */
export function upgradeSaved(config: AgentConfig): AgentConfig {
  const old = CLAUDE_CODE.config.args.slice(2).join(" ");
  return config.kind === "custom" &&
    config.command === "npx" &&
    config.args.join(" ") === old
    ? CLAUDE_CODE.config
    : config;
}

/** The preset an agent configuration is, if it is one. */
export function presetOf(config: AgentConfig): AgentPreset | undefined {
  return PRESETS.find(
    (p) =>
      config.kind === "custom" &&
      config.command === p.config.command &&
      config.args.join(" ") === p.config.args.join(" "),
  );
}

const ENABLED_KEY = "yomu-agents-enabled";

/** The ids used for Codex and for a hand-made agent in the enabled list;
 * a preset uses its own id. */
export const CODEX_ID = "codex";
export const CUSTOM_ID = "custom";

/** The name an agent goes by in the enabled list. */
export function agentId(config: AgentConfig): string {
  return config.kind === "codex"
    ? CODEX_ID
    : (presetOf(config)?.id ?? CUSTOM_ID);
}

/** What to call an agent in the interface. */
export function agentLabel(config: AgentConfig): string {
  if (config.kind === "codex") return "Codex";
  return presetOf(config)?.label ?? config.command.split("/").pop() ?? "Agent";
}

/** Agents the user has turned on (after reading the notice). Nothing runs
 * until it is here, Codex included. A preset or custom agent already in use
 * counts as on, because it was picked by hand before this existed; Codex
 * does not, because it was only ever the default. */
export function readEnabled(inUse: AgentConfig): string[] {
  let ids: string[] = [];
  try {
    const data = JSON.parse(readStorage(ENABLED_KEY) ?? "[]") as unknown;
    if (Array.isArray(data)) {
      ids = data.filter((d): d is string => typeof d === "string");
    }
  } catch {
    // Corrupt value: nothing is enabled.
  }
  if (inUse.kind === "custom") {
    const id = agentId(inUse);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function writeEnabled(ids: string[]) {
  writeStorage(ENABLED_KEY, JSON.stringify(ids));
}

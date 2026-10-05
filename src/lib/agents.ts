import type { AgentConfig } from "@/types/agent";

/** OpenCode, started as `opencode acp`, with the folders it keeps its
 * sign-in, settings, history and cache in. */
export const OPENCODE: Extract<AgentConfig, { kind: "custom" }> = {
  kind: "custom",
  command: "opencode",
  args: ["acp"],
  dataDirs: [
    "~/.local/share/opencode",
    "~/.local/state/opencode",
    "~/.cache/opencode",
    "~/.config/opencode",
  ],
};

export const isOpenCode = (config: AgentConfig) =>
  config.kind === "custom" &&
  config.command === OPENCODE.command &&
  config.args.join(" ") === OPENCODE.args.join(" ");

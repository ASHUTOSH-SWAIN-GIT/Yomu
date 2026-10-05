import { create } from "zustand";
import { agentDiagnose, agentLogin, agentUse, agentWarm } from "@/lib/commands";
import { logError } from "@/lib/log";
import { isReady } from "@/lib/setup";
import { readStorage, writeStorage } from "@/lib/storage";
import { useUiStore } from "@/stores/ui-store";
import type { AgentConfig, Diagnosis } from "@/types/agent";

const CONFIG_KEY = "yomu-agent";
const CODEX: AgentConfig = { kind: "codex" };

/** Reads the saved choice; anything unusable means Codex. */
export function parseAgentConfig(raw: string | null): AgentConfig {
  try {
    const data = JSON.parse(raw ?? "null") as Partial<AgentConfig> | null;
    if (
      data?.kind === "custom" &&
      typeof data.command === "string" &&
      data.command.trim() &&
      Array.isArray(data.args)
    ) {
      const saved = data as { dataDirs?: unknown; dataDir?: unknown };
      const dirs = Array.isArray(saved.dataDirs)
        ? saved.dataDirs
        : typeof saved.dataDir === "string"
          ? [saved.dataDir] // saved by the first version of the settings
          : [];
      return {
        kind: "custom",
        command: data.command,
        args: data.args.filter((a): a is string => typeof a === "string"),
        dataDirs: dirs.filter((d): d is string => typeof d === "string"),
      };
    }
  } catch {
    // Corrupt value: fall back to Codex.
  }
  return CODEX;
}

interface AgentStore {
  /** "setup" means something is missing: for Codex, a step of the checklist
   * (see lib/setup.ts); for a custom agent, that it would not start. */
  status: "checking" | "setup" | "ready";
  diagnosis: Diagnosis | null;
  /** The agent in use. */
  config: AgentConfig;
  /** Why the custom agent would not start, when it did not. */
  customError: string | null;
  refreshStatus: () => Promise<void>;
  /** Switches agent, saves the choice and checks that it starts. */
  setConfig: (config: AgentConfig) => Promise<void>;
  login: () => Promise<void>;
}

// The config the running agent was last started with, so a refresh does not
// restart an agent that is already fine.
let started: string | null = null;

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: "checking",
  diagnosis: null,
  config: parseAgentConfig(readStorage(CONFIG_KEY)),
  customError: null,

  async refreshStatus() {
    const { config } = get();
    if (config.kind === "custom") {
      const key = JSON.stringify(config);
      if (started === key && get().status === "ready") return;
      set({ status: "checking", customError: null });
      try {
        await agentUse(config);
        started = key;
        set({ status: "ready" });
      } catch (err) {
        logError("custom agent would not start", err);
        started = null;
        set({
          status: "setup",
          customError: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    try {
      // Back to Codex if a custom agent was running.
      // A failure to start is not fatal here: the diagnosis below explains
      // what Codex is missing.
      if (started && started !== "codex") {
        await agentUse(CODEX).catch(() => {});
      }
      started = "codex";
      const diagnosis = await agentDiagnose();
      const ready = isReady(diagnosis);
      set({ diagnosis, status: ready ? "ready" : "setup", customError: null });
      // Spin the adapter up now so the first Explain doesn't wait for it.
      if (ready) {
        agentWarm().catch((err) => logError("agent warm-up failed", err));
      }
    } catch (err) {
      logError("agent diagnosis failed", err);
      set({ status: "setup" });
    }
  },

  async setConfig(config) {
    writeStorage(CONFIG_KEY, JSON.stringify(config));
    // A model picked for one agent means nothing to another.
    useUiStore.getState().setChatModel(null);
    started = null;
    set({ config });
    await get().refreshStatus();
  },

  async login() {
    await agentLogin();
    // codex login opens a browser; give it a moment before re-checking
    // rather than polling tightly.
    setTimeout(() => void get().refreshStatus(), 1500);
  },
}));

import { create } from "zustand";
import { agentDiagnose, agentLogin, agentUse, agentWarm } from "@/lib/commands";
import { logError } from "@/lib/log";
import { agentId, readEnabled, upgradeSaved, writeEnabled } from "@/lib/agents";
import { isReady } from "@/lib/setup";
import { readStorage, writeStorage } from "@/lib/storage";
import { useModelsStore } from "@/stores/models-store";
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
  /** "off" means the user has not turned the agent in use on, so nothing
   * has been started or checked. "setup" means something is missing: for
   * Codex, a step of the checklist (see lib/setup.ts); for a custom agent,
   * that it would not start. */
  status: "off" | "checking" | "setup" | "ready";
  diagnosis: Diagnosis | null;
  /** The agent in use. */
  config: AgentConfig;
  /** Ids (see `agentId`) of the agents the user has turned on. */
  enabled: string[];
  /** The agent whose notice is showing, waiting for the user to turn it
   * on. */
  asking: AgentConfig | null;
  ask: (config: AgentConfig) => void;
  cancelAsk: () => void;
  /** Turns the agent on, after the user agreed, and switches to it. */
  enable: (config: AgentConfig) => Promise<void>;
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

const initialConfig = upgradeSaved(parseAgentConfig(readStorage(CONFIG_KEY)));
const initialEnabled = readEnabled(initialConfig);

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: initialEnabled.includes(agentId(initialConfig)) ? "checking" : "off",
  diagnosis: null,
  config: initialConfig,
  enabled: initialEnabled,
  asking: null,
  customError: null,

  ask: (asking) => set({ asking }),
  cancelAsk: () => set({ asking: null }),
  async enable(config) {
    const enabled = [...new Set([...get().enabled, agentId(config)])];
    writeEnabled(enabled);
    set({ enabled, asking: null });
    await get().setConfig(config);
  },

  async refreshStatus() {
    const { config, enabled } = get();
    // Nothing is started, or even looked for, until the user turns it on.
    if (!enabled.includes(agentId(config))) {
      set({ status: "off", customError: null });
      return;
    }
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
      // Anything other than Codex running is switched away from in
      // `setConfig`; here Codex is simply what is in use.
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
    // A model picked for one agent means nothing to another, and the list
    // of models belongs to the agent too.
    useUiStore.getState().setChatModel(null);
    useModelsStore.getState().clear();
    set({ config });
    if (config.kind === "codex") {
      // Codex is the default the Rust side starts with, so it has to be told
      // to go back to it, whatever was running. If Codex cannot start, the
      // diagnosis below says what it is missing.
      started = null;
      await agentUse(CODEX).catch(() => {});
      started = "codex";
    } else {
      started = null;
    }
    await get().refreshStatus();
  },

  async login() {
    await agentLogin();
    // codex login opens a browser; give it a moment before re-checking
    // rather than polling tightly.
    setTimeout(() => void get().refreshStatus(), 1500);
  },
}));

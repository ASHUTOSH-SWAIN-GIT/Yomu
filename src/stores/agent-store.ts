import { create } from "zustand";
import { agentDiagnose, agentLogin, agentWarm } from "@/lib/commands";
import { logError } from "@/lib/log";
import { isReady } from "@/lib/setup";
import type { Diagnosis } from "@/types/agent";

interface AgentStore {
  /** "setup" means something in the checklist (see lib/setup.ts) is missing. */
  status: "checking" | "setup" | "ready";
  diagnosis: Diagnosis | null;
  refreshStatus: () => Promise<void>;
  login: () => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: "checking",
  diagnosis: null,

  async refreshStatus() {
    try {
      const diagnosis = await agentDiagnose();
      const ready = isReady(diagnosis);
      set({ diagnosis, status: ready ? "ready" : "setup" });
      // Spin the adapter up now so the first Explain doesn't wait for it.
      if (ready) {
        agentWarm().catch((err) => logError("agent warm-up failed", err));
      }
    } catch (err) {
      logError("agent diagnosis failed", err);
      set({ status: "setup" });
    }
  },

  async login() {
    await agentLogin();
    // codex login opens a browser; give it a moment before re-checking
    // rather than polling tightly.
    setTimeout(() => void get().refreshStatus(), 1500);
  },
}));

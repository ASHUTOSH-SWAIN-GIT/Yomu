import { create } from "zustand";
import { agentLogin, agentStatus, agentWarm } from "@/lib/commands";
import { logError } from "@/lib/log";
import type { AgentStatus } from "@/types/agent";

interface AgentStore {
  status: AgentStatus | "checking";
  refreshStatus: () => Promise<void>;
  login: () => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: "checking",

  async refreshStatus() {
    const status = await agentStatus();
    set({ status });
    // Spin the adapter up now so the first Explain doesn't wait for it.
    if (status === "ready") {
      agentWarm().catch((err) => logError("agent warm-up failed", err));
    }
  },

  async login() {
    await agentLogin();
    // codex login opens a browser; give it a moment before re-checking
    // rather than polling tightly.
    setTimeout(() => void get().refreshStatus(), 1500);
  },
}));

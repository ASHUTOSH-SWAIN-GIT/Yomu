import { create } from "zustand";
import { agentLogin, agentStatus } from "@/lib/commands";
import type { AgentStatus } from "@/types/agent";

interface AgentStore {
  status: AgentStatus | "checking";
  refreshStatus: () => Promise<void>;
  login: () => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: "checking",

  async refreshStatus() {
    set({ status: await agentStatus() });
  },

  async login() {
    await agentLogin();
    // codex login opens a browser; give it a moment before re-checking
    // rather than polling tightly.
    setTimeout(() => void get().refreshStatus(), 1500);
  },
}));

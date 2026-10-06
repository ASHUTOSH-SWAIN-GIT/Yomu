import { create } from "zustand";
import { agentListModels } from "@/lib/commands";
import { logError } from "@/lib/log";
import type { AgentModel } from "@/types/agent";

interface ModelsStore {
  /** What the agent in use offers; null until asked. */
  models: AgentModel[] | null;
  failed: boolean;
  /** Asks the agent, unless the list is already known. */
  load: () => Promise<void>;
  /** Forgets the list, for when the agent changes. */
  clear: () => void;
}

// Bumped by `clear`, so an answer from the agent that was in use before the
// switch cannot land after it.
let generation = 0;

export const useModelsStore = create<ModelsStore>((set, get) => ({
  models: null,
  failed: false,

  async load() {
    if (get().models) return;
    const mine = generation;
    set({ failed: false });
    try {
      const models = await agentListModels();
      if (mine === generation) set({ models });
    } catch (err) {
      logError("listing models failed", err);
      if (mine === generation) set({ failed: true });
    }
  },

  clear() {
    generation += 1;
    set({ models: null, failed: false });
  },
}));

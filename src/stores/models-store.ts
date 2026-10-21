import { create } from "zustand";
import { agentListModels } from "@/lib/commands";
import { logError } from "@/lib/log";
import {
  readUnusable,
  rememberUnusable,
  unusableKey,
  withoutUnusable,
} from "@/lib/unusable-models";
import type { AgentConfig, AgentModel } from "@/types/agent";

interface ModelsStore {
  /** What the agent in use offers; null until asked. */
  models: AgentModel[] | null;
  failed: boolean;
  /** Models this account has had refused by the agent in use (see
   * lib/unusable-models.ts); they are never offered again. */
  unusable: string[];
  /** Which agent `unusable` was read for, so it is not read on every look. */
  unusableFor: string | null;
  /** Asks the agent, unless the list is already known. */
  load: (config: AgentConfig) => Promise<void>;
  /** Forgets the list, for when the agent changes. */
  clear: () => void;
  /** Drops a model the agent just refused, for good. */
  hide: (id: string) => void;
}

// Bumped by `clear`, so an answer from the agent that was in use before the
// switch cannot land after it.
let generation = 0;

export const useModelsStore = create<ModelsStore>((set, get) => ({
  models: null,
  failed: false,
  unusable: [],
  unusableFor: null,

  async load(config) {
    // Refusals belong to the agent, so they are re-read when it changes.
    const key = unusableKey(config);
    if (get().unusableFor !== key) {
      set({ unusable: readUnusable(key), unusableFor: key });
    }
    if (get().models) return;
    const mine = generation;
    set({ failed: false });
    try {
      const models = await agentListModels();
      if (mine === generation) {
        set({ models: withoutUnusable(models, get().unusable) });
      }
    } catch (err) {
      logError("listing models failed", err);
      if (mine === generation) set({ failed: true });
    }
  },

  clear() {
    generation += 1;
    set({ models: null, failed: false });
  },

  hide(id) {
    const key = get().unusableFor;
    if (!key) return;
    const unusable = rememberUnusable(key, id);
    set({
      unusable,
      models: get().models?.filter((model) => model.id !== id) ?? null,
    });
  },
}));

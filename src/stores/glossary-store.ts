import { create } from "zustand";
import { buildGlossary, type GlossaryTerm } from "@/lib/glossary";
import { listGlossaryRows } from "@/lib/db";
import { logError } from "@/lib/log";

interface GlossaryStore {
  terms: GlossaryTerm[];
  /** Reads what the agent has explained so far (all articles). */
  load: () => Promise<void>;
}

export const useGlossaryStore = create<GlossaryStore>((set) => ({
  terms: [],
  async load() {
    try {
      set({ terms: buildGlossary(await listGlossaryRows()) });
    } catch (err) {
      // The glossary is a nicety: the reader works without it.
      logError("loading the glossary failed", err);
    }
  },
}));

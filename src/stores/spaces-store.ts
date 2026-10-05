import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";
import { INBOX, assignSlots } from "@/lib/spaces";
import { normalizeTag } from "@/lib/tags";

const ACTIVE_KEY = "yomu-space";
const EXTRA_KEY = "yomu-spaces-extra";
const SLOTS_KEY = "yomu-space-slots";

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseExtra(raw: string | null): string[] {
  const value = parseJson<unknown>(raw, []);
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
}

function parseSlots(raw: string | null): Record<string, number> {
  const value = parseJson<unknown>(raw, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => typeof v === "number",
    ) as [string, number][],
  );
}

interface SpacesStore {
  /** The space shown in the sidebar and used for colour: INBOX or a tag. */
  active: string;
  /** Spaces created by the user that may not hold an article yet. */
  extra: string[];
  /** Colour slot per space (see lib/spaces.ts). */
  slots: Record<string, number>;
  setActive: (id: string) => void;
  /** The "New collection" page is open. */
  /** The universal chat page is open. */
  libraryChat: boolean;
  setLibraryChat: (on: boolean) => void;
  /** The library shows archived articles instead of the active space. */
  showArchive: boolean;
  setShowArchive: (on: boolean) => void;
  /** Creates a space from a name; returns its id, or null if the name is empty. */
  createSpace: (name: string) => string | null;
  /** Forgets a space you created. Its articles are untagged by the caller. */
  deleteSpace: (id: string) => void;
  /** Gives every known space a stable colour slot. */
  syncSlots: (names: string[]) => void;
}

export const useSpacesStore = create<SpacesStore>((set, get) => ({
  active: readStorage(ACTIVE_KEY) || INBOX,
  extra: parseExtra(readStorage(EXTRA_KEY)),
  slots: parseSlots(readStorage(SLOTS_KEY)),

  setActive(id) {
    writeStorage(ACTIVE_KEY, id);
    set({
      active: id,
      showArchive: false,
      libraryChat: false,
    });
  },

  libraryChat: false,
  setLibraryChat: (libraryChat) => set({ libraryChat }),

  showArchive: false,
  setShowArchive: (showArchive) => set({ showArchive, libraryChat: false }),

  createSpace(name) {
    const id = normalizeTag(name);
    if (!id || id === INBOX) return null;
    const extra = get().extra.includes(id) ? get().extra : [...get().extra, id];
    writeStorage(EXTRA_KEY, JSON.stringify(extra));
    get().syncSlots([...extra]);
    get().setActive(id);
    set({ extra });
    return id;
  },

  deleteSpace(id) {
    const extra = get().extra.filter((e) => e !== id);
    writeStorage(EXTRA_KEY, JSON.stringify(extra));
    set({ extra });
    if (get().active === id) get().setActive(INBOX);
  },

  syncSlots(names) {
    const known = [...new Set([...names, ...get().extra])];
    const slots = assignSlots(known, get().slots);
    // Keep colours of spaces not listed now (e.g. temporarily empty).
    const merged = { ...get().slots, ...slots };
    if (JSON.stringify(merged) === JSON.stringify(get().slots)) return;
    writeStorage(SLOTS_KEY, JSON.stringify(merged));
    set({ slots: merged });
  },
}));

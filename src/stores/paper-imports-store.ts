import { create } from "zustand";
import { logError } from "@/lib/log";
import { addPaper } from "@/lib/pdf/add";
import { baseName } from "@/lib/pdf/identity";

export interface PaperImport {
  id: number;
  name: string;
  status: "waiting" | "reading" | "added" | "already" | "failed";
  /** Pages read so far, 0 to 1, while reading. */
  fraction?: number;
  error?: string;
}

interface PaperImportsStore {
  items: PaperImport[];
  /** Adds PDFs to the library one after another, without opening them. */
  add: (paths: string[]) => void;
  /** Clears the finished ones from the list. */
  clearDone: () => void;
}

let nextId = 1;
let running = false;

/** Several PDFs at once (dropped together, or picked together) go in a queue
 * that the Papers page shows, read one at a time so a big batch does not
 * hold every file in memory at once. */
export const usePaperImports = create<PaperImportsStore>((set, get) => {
  // Each queued file's path, until it has been read.
  const paths = new Map<number, string>();
  const update = (id: number, change: Partial<PaperImport>) =>
    set({
      items: get().items.map((i) => (i.id === id ? { ...i, ...change } : i)),
    });

  async function drain() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = get().items.find((i) => i.status === "waiting");
        if (!next) break;
        update(next.id, { status: "reading", fraction: 0 });
        try {
          const { added } = await addPaper(paths.get(next.id)!, (p) =>
            update(next.id, { fraction: p.page / p.pages }),
          );
          update(next.id, { status: added ? "added" : "already" });
        } catch (err) {
          logError(`adding ${next.name} failed`, err);
          update(next.id, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
        paths.delete(next.id);
      }
    } finally {
      running = false;
    }
  }

  return {
    items: [],
    add(list) {
      const fresh = list.map((path) => {
        const id = nextId++;
        paths.set(id, path);
        return { id, name: baseName(path), status: "waiting" as const };
      });
      set({ items: [...get().items, ...fresh] });
      void drain();
    },
    clearDone() {
      set({
        items: get().items.filter(
          (i) => i.status === "waiting" || i.status === "reading",
        ),
      });
    },
  };
});

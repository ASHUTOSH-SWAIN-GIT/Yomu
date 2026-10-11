import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  /** One follow-up, such as Undo. */
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toast: Toast | null;
  dismiss: () => void;
}

/** How long a note stays up, in ms (longer when it offers an action). */
const SHOWN = 3000;
const SHOWN_WITH_ACTION = 6000;

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  dismiss: () => {
    clearTimeout(timer);
    set({ toast: null });
  },
}));

/** A short note at the bottom of the window ("Exported", "Archived · Undo").
 * Only one shows at a time: a new one replaces the old. */
export function toast(message: string, action?: Toast["action"]) {
  clearTimeout(timer);
  const id = nextId++;
  useToastStore.setState({ toast: { id, message, action } });
  timer = setTimeout(
    () => {
      if (useToastStore.getState().toast?.id === id)
        useToastStore.setState({ toast: null });
    },
    action ? SHOWN_WITH_ACTION : SHOWN,
  );
}

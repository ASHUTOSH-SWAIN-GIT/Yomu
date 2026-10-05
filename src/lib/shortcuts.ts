/** Global keyboard shortcuts. A pure mapping from a key event to a named
 * command, so it can be tested without a DOM. Cmd on macOS, Ctrl elsewhere. */
export type ShortcutId =
  "palette" | "toggle-sidebar" | "focus-ask" | "focus-mode" | "paste-link";

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}

export function shortcutFor(e: KeyLike): ShortcutId | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const key = e.key.toLowerCase();

  if (e.shiftKey) return key === "v" ? "paste-link" : null;
  if (key === "k") return "palette";
  if (key === "b") return "toggle-sidebar";
  if (key === "j") return "focus-ask";
  if (key === ".") return "focus-mode";
  return null;
}

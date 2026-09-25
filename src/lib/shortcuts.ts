/** Global keyboard shortcuts. A pure mapping from a key event to a named
 * command, so it can be tested without a DOM. Cmd on macOS, Ctrl elsewhere. */
export type ShortcutId =
  | "palette"
  | "new-tab"
  | "close-tab"
  | "toggle-sidebar"
  | "toggle-answer"
  | "focus-mode"
  | "paste-link"
  | `tab-${number}`;

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
  if (key === "t") return "new-tab";
  if (key === "w") return "close-tab";
  if (key === "b") return "toggle-sidebar";
  if (key === "j") return "toggle-answer";
  if (key === ".") return "focus-mode";
  if (/^[1-9]$/.test(key)) return `tab-${Number(key)}`;
  return null;
}

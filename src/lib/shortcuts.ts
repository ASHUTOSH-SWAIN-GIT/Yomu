/** Global keyboard shortcuts. A pure mapping from a key event to a named
 * command, so it can be tested without a DOM. Cmd on macOS, Ctrl elsewhere. */
export type ShortcutId =
  | "palette"
  | "toggle-sidebar"
  | "focus-ask"
  | "focus-mode"
  | "paste-link"
  | "settings"
  | "new-chat"
  | "home"
  | "toggle-chat"
  | "shortcuts"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab";

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

  if (key === "tab") return e.shiftKey ? "prev-tab" : "next-tab";
  if (e.shiftKey) {
    if (key === "v") return "paste-link";
    if (key === "h") return "home";
    // Shift turns [ and ] into { and } on most keyboards.
    if (key === "]" || key === "}") return "next-tab";
    if (key === "[" || key === "{") return "prev-tab";
    return null;
  }
  if (key === "k") return "palette";
  if (key === ",") return "settings";
  if (key === "b") return "toggle-sidebar";
  if (key === "j") return "focus-ask";
  if (key === ".") return "focus-mode";
  if (key === "n") return "new-chat";
  if (key === "t") return "new-tab";
  if (key === "w") return "close-tab";
  if (key === "e") return "toggle-chat";
  if (key === "/") return "shortcuts";
  return null;
}

/** What the shortcuts sheet lists: [keys after Cmd/Ctrl, what it does]. */
export const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Go to",
    items: [
      ["K", "Command palette"],
      ["⇧H", "Home"],
      ["N", "New chat"],
      ["T", "New tab"],
      ["W", "Close tab"],
      ["⇧]", "Next tab (or Ctrl+Tab)"],
      ["⇧[", "Previous tab"],
      [",", "Settings"],
    ],
  },
  {
    title: "Reading",
    items: [
      ["⇧V", "Open the link on your clipboard"],
      ["E", "Show or hide the chat beside the article"],
      ["J", "Ask: jump to the chat box"],
      [".", "Focus mode (Esc leaves it)"],
    ],
  },
  {
    title: "Window",
    items: [
      ["B", "Show or hide the sidebar"],
      ["+", "Zoom in"],
      ["−", "Zoom out"],
      ["0", "Reset zoom"],
      ["/", "This list"],
    ],
  },
];

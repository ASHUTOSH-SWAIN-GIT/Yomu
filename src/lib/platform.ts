/** True in the packaged app on macOS, where the window's title bar is an
 * overlay (tauri.conf.json: titleBarStyle "Overlay") and the traffic-light
 * buttons sit inside our own UI, so the layout must leave room for them. */
export function usesOverlayTitleBar(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    /Mac/.test(navigator.platform)
  );
}

/** The modifier key as shortcuts are written on this computer. */
export const MOD =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
    ? "⌘"
    : "Ctrl+";

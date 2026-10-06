import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readStorage, writeStorage } from "@/lib/storage";

const ZOOM_KEY = "yomu-zoom";
export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** The saved zoom level, or 1. */
export function savedZoom(): number {
  const n = Number(readStorage(ZOOM_KEY));
  return ZOOM_STEPS.includes(n) ? n : 1;
}

/** The next step up (+1) or down (-1) from `level`, within the steps. */
export function stepZoom(level: number, dir: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(level);
  const next = (i === -1 ? ZOOM_STEPS.indexOf(1) : i) + dir;
  return ZOOM_STEPS[Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)];
}

/** Zooms the whole window like a browser does (text, images and layout),
 * and remembers it. Outside Tauri (the vite page) it uses CSS zoom. */
export async function applyZoom(level: number) {
  writeStorage(ZOOM_KEY, String(level));
  if ("__TAURI_INTERNALS__" in window) {
    await getCurrentWebview().setZoom(level);
  } else {
    document.documentElement.style.zoom = String(level);
  }
}

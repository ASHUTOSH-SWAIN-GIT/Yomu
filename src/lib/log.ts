import { error as logToFile } from "@tauri-apps/plugin-log";

/** Writes to the local app log file (never sent anywhere). Logging must
 * never break the UI, so failures (e.g. outside Tauri) are swallowed. */
export function logError(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  void logToFile(`${context}: ${message}`).catch(() => {});
}

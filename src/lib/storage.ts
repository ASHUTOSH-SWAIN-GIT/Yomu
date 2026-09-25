// localStorage can be missing or throw (private windows, previews, tests), so
// every access is guarded and callers work without it.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; the setting still applies for this session.
  }
}

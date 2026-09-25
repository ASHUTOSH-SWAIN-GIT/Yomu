/**
 * Theme and reading preferences: types, safe parsing of stored values, and
 * how they are applied to the document. `public/theme-init.js` repeats the
 * apply step before first paint (it can't import this), so keep the two in
 * step.
 */

export type Theme = "light" | "paper" | "dark" | "system";
export type ReaderFont = "serif" | "sans";
export type ReaderSize = "s" | "m" | "l" | "xl";
export type ReaderMeasure = "narrow" | "medium" | "wide";

export interface ReaderPrefs {
  font: ReaderFont;
  size: ReaderSize;
  measure: ReaderMeasure;
}

export const DEFAULT_READER: ReaderPrefs = {
  font: "serif",
  size: "m",
  measure: "medium",
};

export const THEME_KEY = "yomu-theme";
export const READER_KEY = "yomu-reader";

const THEMES: Theme[] = ["light", "paper", "dark", "system"];
const FONTS: ReaderFont[] = ["serif", "sans"];
const SIZES: ReaderSize[] = ["s", "m", "l", "xl"];
const MEASURES: ReaderMeasure[] = ["narrow", "medium", "wide"];

export function parseTheme(raw: string | null | undefined): Theme {
  return THEMES.includes(raw as Theme) ? (raw as Theme) : "system";
}

/** Reads stored reader prefs, ignoring anything invalid field by field so a
 * bad or old value can never break the reader. */
export function parseReaderPrefs(raw: string | null | undefined): ReaderPrefs {
  let data: Partial<Record<keyof ReaderPrefs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // Corrupt JSON: fall back to defaults.
  }
  return {
    font: FONTS.includes(data.font as ReaderFont)
      ? (data.font as ReaderFont)
      : DEFAULT_READER.font,
    size: SIZES.includes(data.size as ReaderSize)
      ? (data.size as ReaderSize)
      : DEFAULT_READER.size,
    measure: MEASURES.includes(data.measure as ReaderMeasure)
      ? (data.measure as ReaderMeasure)
      : DEFAULT_READER.measure,
  };
}

/** The class the document root gets for a theme ("" for Page). */
export function themeClass(theme: Theme, systemPrefersDark: boolean): string {
  if (theme === "system") return systemPrefersDark ? "dark" : "";
  return theme === "light" ? "" : theme;
}

/** The subset of a DOM element `applyAppearance` needs (easy to fake). */
export interface RootLike {
  classList: { toggle: (name: string, force?: boolean) => unknown };
  dataset: Record<string, string | undefined>;
}

export function applyAppearance(
  root: RootLike,
  theme: Theme,
  systemPrefersDark: boolean,
  reader: ReaderPrefs,
) {
  const cls = themeClass(theme, systemPrefersDark);
  root.classList.toggle("dark", cls === "dark");
  root.classList.toggle("paper", cls === "paper");

  // Defaults carry no attribute: the CSS variables already hold them.
  root.dataset.readerFont = reader.font === "serif" ? undefined : reader.font;
  root.dataset.readerSize = reader.size === "m" ? undefined : reader.size;
  root.dataset.readerMeasure =
    reader.measure === "medium" ? undefined : reader.measure;
}

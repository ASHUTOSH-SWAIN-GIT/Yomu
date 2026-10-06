/**
 * Theme and reading preferences: types, safe parsing of stored values, and
 * how they are applied to the document. `public/theme-init.js` repeats the
 * apply step before first paint (it can't import this), so keep the two in
 * step.
 */

import {
  THEMES as THEME_LIST,
  type ThemeId,
  type ThemeMeta,
} from "@/lib/themes";

/** A colour theme, or "system" to follow macOS light/dark. */
export type Theme = ThemeId | "system";
export type ReaderFont = "serif" | "sans";
export type ReaderSize = "s" | "m" | "l" | "xl";
export type ReaderMeasure = "narrow" | "medium" | "wide";

export interface ReaderPrefs {
  font: ReaderFont;
  size: ReaderSize;
  measure: ReaderMeasure;
}

export const DEFAULT_READER: ReaderPrefs = {
  font: "sans",
  size: "m",
  measure: "medium",
};

export const THEME_KEY = "yomu-theme";
/** "light" or "dark", saved with the theme for public/theme-init.js. */
export const THEME_MODE_KEY = "yomu-theme-mode";
export const READER_KEY = "yomu-reader";

const THEME_IDS = new Set<string>(THEME_LIST.map((t) => t.id));
const FONTS: ReaderFont[] = ["sans", "serif"];
const SIZES: ReaderSize[] = ["s", "m", "l", "xl"];
const MEASURES: ReaderMeasure[] = ["narrow", "medium", "wide"];

export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "system" || (raw && THEME_IDS.has(raw))
    ? (raw as Theme)
    : "system";
}

/** The theme actually shown: "system" becomes Yomu Light or Yomu Dark. */
export function resolveTheme(
  theme: Theme,
  systemPrefersDark: boolean,
): ThemeMeta {
  const id: ThemeId =
    theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
  return THEME_LIST.find((t) => t.id === id) ?? THEME_LIST[0];
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
  // Every dark theme carries the `dark` class (for `color-scheme`, scroll
  // bars and dark-only rules); the theme's own colours come from
  // `data-theme`, which Yomu Light and Yomu Dark don't need.
  const meta = resolveTheme(theme, systemPrefersDark);
  root.classList.toggle("dark", meta.mode === "dark");
  root.dataset.theme =
    meta.id === "light" || meta.id === "dark" ? undefined : meta.id;

  // Defaults carry no attribute: the CSS variables already hold them.
  root.dataset.readerFont = reader.font === "sans" ? undefined : reader.font;
  root.dataset.readerSize = reader.size === "m" ? undefined : reader.size;
  root.dataset.readerMeasure =
    reader.measure === "medium" ? undefined : reader.measure;
}

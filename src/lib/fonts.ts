import { logError } from "@/lib/log";

/** The typefaces an article can be set in. Sans (Inter) is the default and
 * is already loaded; the system serif and Plex Mono need nothing extra; the
 * rest are self-hosted (so the CSP stays strict) and loaded the first time
 * they are chosen. Each font's stack is in index.css, under
 * `data-reader-font`. */
export const FONTS = [
  { id: "sans", label: "Inter", kind: "Sans" },
  {
    id: "source-sans",
    label: "Source Sans",
    kind: "Sans",
    load: () => import("@fontsource-variable/source-sans-3/wght.css"),
    loadItalic: () =>
      import("@fontsource-variable/source-sans-3/wght-italic.css"),
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    kind: "Sans",
    load: () =>
      import("@fontsource-variable/atkinson-hyperlegible-next/wght.css"),
    loadItalic: () =>
      import("@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css"),
  },
  { id: "serif", label: "System serif", kind: "Serif" },
  {
    id: "source-serif",
    label: "Source Serif",
    kind: "Serif",
    load: () => import("@fontsource-variable/source-serif-4/wght.css"),
    loadItalic: () =>
      import("@fontsource-variable/source-serif-4/wght-italic.css"),
  },
  {
    id: "literata",
    label: "Literata",
    kind: "Serif",
    load: () => import("@fontsource-variable/literata/wght.css"),
    loadItalic: () => import("@fontsource-variable/literata/wght-italic.css"),
  },
  {
    id: "lora",
    label: "Lora",
    kind: "Serif",
    load: () => import("@fontsource-variable/lora/wght.css"),
    loadItalic: () => import("@fontsource-variable/lora/wght-italic.css"),
  },
  {
    id: "merriweather",
    label: "Merriweather",
    kind: "Serif",
    load: () => import("@fontsource-variable/merriweather/wght.css"),
    loadItalic: () =>
      import("@fontsource-variable/merriweather/wght-italic.css"),
  },
  {
    id: "newsreader",
    label: "Newsreader",
    kind: "Serif",
    load: () => import("@fontsource-variable/newsreader/wght.css"),
    loadItalic: () => import("@fontsource-variable/newsreader/wght-italic.css"),
  },
  { id: "mono", label: "IBM Plex Mono", kind: "Mono" },
] as const;

export type ReaderFont = (typeof FONTS)[number]["id"];
export type FontMeta = (typeof FONTS)[number];

/** The kinds in menu order. */
export const FONT_KINDS = ["Sans", "Serif", "Mono"] as const;

const loaded = new Set<string>();

/** Loads the files of font `id` (once). A font that fails to load simply
 * shows in the fallback of its stack. */
export function loadFont(id: ReaderFont) {
  const font: FontMeta | undefined = FONTS.find((f) => f.id === id);
  if (!font || !("load" in font) || loaded.has(id)) return;
  loaded.add(id);
  Promise.all([font.load(), font.loadItalic()]).catch((err) => {
    loaded.delete(id);
    logError(`loading the ${font.label} font failed`, err);
  });
}

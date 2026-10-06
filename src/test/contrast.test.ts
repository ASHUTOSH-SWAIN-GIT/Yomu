/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { THEMES } from "@/lib/themes";

// Reads the real design tokens from index.css and themes.css, so changing a colour there
// re-checks accessibility for the theme (WCAG 2.x contrast ratios).

const css = ["../index.css", "../themes.css"]
  .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
  .join("\n");

function tokensIn(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0)
    throw new Error(`no ${selector} block in index.css or themes.css`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

// Paper and Yomu Dark override only some tokens; the rest come from Yomu
// Light. A named dark theme is shown with the dark class too, so its
// missing tokens come from Yomu Dark (and it must not be missing any
// colour, which is checked below).
const base = tokensIn(":root");
const dark = { ...base, ...tokensIn(":root.dark") };
const themes: Record<string, Record<string, string>> = {
  light: base,
  paper: { ...base, ...tokensIn(':root[data-theme="paper"]') },
  dark,
};
for (const t of THEMES) {
  if (t.id === "light" || t.id === "dark" || t.id === "paper") continue;
  themes[t.id] = {
    ...(t.mode === "dark" ? dark : base),
    ...tokensIn(`:root[data-theme="${t.id}"]`),
  };
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio, what it is]
const PAIRS: [string, string, number, string][] = [
  ["foreground", "background", 4.5, "body text"],
  ["muted-foreground", "background", 4.5, "secondary text"],
  ["muted-foreground", "muted", 4.5, "secondary text on tinted areas"],
  ["muted-foreground", "frame-base", 4.5, "secondary text on the window frame"],
  ["foreground", "frame-base", 4.5, "text on the window frame"],
  ["popover-foreground", "popover", 4.5, "menu text"],
  ["primary-foreground", "primary", 4.5, "primary button text"],
  ["secondary-foreground", "secondary", 4.5, "secondary button text"],
  ["accent-foreground", "accent", 4.5, "hovered item text"],
  ["destructive", "background", 4.5, "error text"],
  ["destructive", "muted", 4.5, "error text on tinted areas"],
  ["destructive-foreground", "destructive", 4.5, "destructive button text"],
  ["input", "background", 3, "input and outlined-button edges"],
  ["muted-foreground", "card", 4.5, "secondary text on cards"],
  ["muted-foreground", "popover", 4.5, "secondary text in menus"],
  ["honey-ink", "background", 4.5, "note numbers and honey text"],
  ["ring", "background", 3, "focus ring"],
  // Every space colour is used as a line, dot or fill against the surface.
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): [string, string, number, string] => [
    `sp-${i}`,
    "background",
    3,
    `space colour ${i}`,
  ]),
  ["sp-inbox", "background", 3, "Inbox colour"],
];

describe.each(Object.entries(themes))("%s theme contrast", (_name, tokens) => {
  it.each(PAIRS)("%s on %s is at least %s:1 (%s)", (fg, bg, min) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("theme list", () => {
  it("has a colour block for every theme, defining every colour itself", () => {
    const colours = Object.keys(tokensIn(":root.dark"));
    for (const t of THEMES) {
      if (t.id === "light" || t.id === "dark" || t.id === "paper") continue;
      const own = tokensIn(`:root[data-theme="${t.id}"]`);
      // Nothing may leak in from Yomu Dark or Yomu Light.
      for (const name of colours) {
        expect(own[name], `${t.id} is missing --${name}`).toBeDefined();
      }
    }
  });

  it("names every theme once, with a valid pair", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) expect(ids).toContain(t.pair);
  });
});

describe("contrast helper", () => {
  it("matches known WCAG values", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

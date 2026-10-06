#!/usr/bin/env node
// Generates the named colour themes (Catppuccin, One Dark, Gruvbox, ...)
// from their official palettes:
//
//   - the CSS token blocks in src/themes.css;
//   - src/lib/themes.ts, the list the app and the theme menu use.
//
// Each palette maps onto the same tokens the hand-made themes use, so every
// component works in every theme. Where a palette colour is too faint for
// its job (secondary text, error text, focus ring, ...), it is nudged toward
// more contrast until it meets the same WCAG ratios that
// src/test/contrast.test.ts checks. Run after changing a palette:
//
//   node scripts/generate-themes.mjs

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);

// ---- The palettes ---------------------------------------------------------
// bg: the page. frame: sidebar and window frame. surface: tinted areas
// (code, inputs, hover). surface2: selected items, secondary buttons.
// border: hairlines. text / subtext: ink. accent: highlights and focus.
// red: errors. spaces: eight palette colours for collections.

const PALETTES = [
  // Light
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    mode: "light",
    shiki: "catppuccin-latte",
    pair: "catppuccin-mocha",
    bg: "#eff1f5",
    frame: "#e6e9ef",
    card: "#f5f6f9",
    surface: "#e6e9ef",
    surface2: "#dce0e8",
    border: "#ccd0da",
    text: "#4c4f69",
    subtext: "#6c6f85",
    accent: "#8839ef",
    red: "#d20f39",
    spaces: [
      "#1e66f5",
      "#40a02b",
      "#fe640b",
      "#8839ef",
      "#d20f39",
      "#179299",
      "#ea76cb",
      "#df8e1d",
    ],
  },
  {
    id: "one-light",
    label: "One Light",
    mode: "light",
    shiki: "one-light",
    pair: "one-dark",
    bg: "#fafafa",
    frame: "#f0f0f1",
    card: "#ffffff",
    surface: "#f0f0f1",
    surface2: "#e5e5e6",
    border: "#dbdbdc",
    text: "#383a42",
    subtext: "#696c77",
    accent: "#4078f2",
    red: "#e45649",
    spaces: [
      "#4078f2",
      "#50a14f",
      "#986801",
      "#a626a4",
      "#e45649",
      "#0184bc",
      "#c18401",
      "#696c77",
    ],
  },
  {
    id: "gruvbox-light",
    label: "Gruvbox Light",
    mode: "light",
    shiki: "gruvbox-light-medium",
    pair: "gruvbox-dark",
    bg: "#fbf1c7",
    frame: "#f2e5bc",
    card: "#f9f5d7",
    surface: "#f2e5bc",
    surface2: "#ebdbb2",
    border: "#d5c4a1",
    text: "#3c3836",
    subtext: "#665c54",
    accent: "#af3a03",
    red: "#9d0006",
    spaces: [
      "#076678",
      "#79740e",
      "#af3a03",
      "#8f3f71",
      "#9d0006",
      "#427b58",
      "#b57614",
      "#7c6f64",
    ],
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    mode: "light",
    shiki: "solarized-light",
    pair: "solarized-dark",
    bg: "#fdf6e3",
    frame: "#eee8d5",
    card: "#fffbf0",
    surface: "#eee8d5",
    surface2: "#e4ddc8",
    border: "#ddd6c1",
    text: "#073642",
    subtext: "#586e75",
    accent: "#268bd2",
    red: "#dc322f",
    spaces: [
      "#268bd2",
      "#859900",
      "#cb4b16",
      "#6c71c4",
      "#dc322f",
      "#2aa198",
      "#d33682",
      "#b58900",
    ],
  },
  {
    id: "rose-pine-dawn",
    label: "Rosé Pine Dawn",
    mode: "light",
    shiki: "rose-pine-dawn",
    pair: "rose-pine",
    bg: "#faf4ed",
    frame: "#f2e9e1",
    card: "#fffaf3",
    surface: "#f4ede8",
    surface2: "#dfdad9",
    border: "#dfdad9",
    text: "#575279",
    subtext: "#797593",
    accent: "#907aa9",
    red: "#b4637a",
    spaces: [
      "#286983",
      "#56949f",
      "#ea9d34",
      "#907aa9",
      "#b4637a",
      "#d7827e",
      "#797593",
      "#9893a5",
    ],
  },
  {
    id: "github-light",
    label: "GitHub Light",
    mode: "light",
    shiki: "github-light-default",
    pair: "github-dark",
    bg: "#ffffff",
    frame: "#f6f8fa",
    card: "#ffffff",
    surface: "#f6f8fa",
    surface2: "#eaeef2",
    border: "#d0d7de",
    text: "#1f2328",
    subtext: "#59636e",
    accent: "#0969da",
    red: "#cf222e",
    spaces: [
      "#0969da",
      "#1a7f37",
      "#9a6700",
      "#8250df",
      "#cf222e",
      "#1b7c83",
      "#bf3989",
      "#bc4c00",
    ],
  },

  // Dark
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    mode: "dark",
    shiki: "catppuccin-mocha",
    pair: "catppuccin-latte",
    bg: "#1e1e2e",
    frame: "#181825",
    surface: "#262637",
    surface2: "#313244",
    border: "#313244",
    text: "#cdd6f4",
    subtext: "#a6adc8",
    accent: "#cba6f7",
    red: "#f38ba8",
    spaces: [
      "#89b4fa",
      "#a6e3a1",
      "#fab387",
      "#cba6f7",
      "#f38ba8",
      "#94e2d5",
      "#f5c2e7",
      "#f9e2af",
    ],
  },
  {
    id: "catppuccin-macchiato",
    label: "Catppuccin Macchiato",
    mode: "dark",
    shiki: "catppuccin-macchiato",
    pair: "catppuccin-latte",
    bg: "#24273a",
    frame: "#1e2030",
    surface: "#2c2f45",
    surface2: "#363a4f",
    border: "#363a4f",
    text: "#cad3f5",
    subtext: "#a5adcb",
    accent: "#c6a0f6",
    red: "#ed8796",
    spaces: [
      "#8aadf4",
      "#a6da95",
      "#f5a97f",
      "#c6a0f6",
      "#ed8796",
      "#8bd5ca",
      "#f5bde6",
      "#eed49f",
    ],
  },
  {
    id: "one-dark",
    label: "One Dark",
    mode: "dark",
    shiki: "one-dark-pro",
    pair: "one-light",
    bg: "#282c34",
    frame: "#21252b",
    surface: "#2c313a",
    surface2: "#3e4451",
    border: "#3a3f4b",
    text: "#abb2bf",
    subtext: "#8b929e",
    accent: "#61afef",
    red: "#e06c75",
    spaces: [
      "#61afef",
      "#98c379",
      "#d19a66",
      "#c678dd",
      "#e06c75",
      "#56b6c2",
      "#e5c07b",
      "#abb2bf",
    ],
  },
  {
    id: "gruvbox-dark",
    label: "Gruvbox Dark",
    mode: "dark",
    shiki: "gruvbox-dark-medium",
    pair: "gruvbox-light",
    bg: "#282828",
    frame: "#1d2021",
    surface: "#32302f",
    surface2: "#3c3836",
    border: "#3c3836",
    text: "#ebdbb2",
    subtext: "#a89984",
    accent: "#fabd2f",
    red: "#fb4934",
    spaces: [
      "#83a598",
      "#b8bb26",
      "#fe8019",
      "#d3869b",
      "#fb4934",
      "#8ec07c",
      "#fabd2f",
      "#a89984",
    ],
  },
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    shiki: "dracula",
    pair: "light",
    bg: "#282a36",
    frame: "#21222c",
    surface: "#303241",
    surface2: "#44475a",
    border: "#3a3c4e",
    text: "#f8f8f2",
    subtext: "#a4abd0",
    accent: "#bd93f9",
    red: "#ff5555",
    spaces: [
      "#8be9fd",
      "#50fa7b",
      "#ffb86c",
      "#bd93f9",
      "#ff5555",
      "#ff79c6",
      "#f1fa8c",
      "#6272a4",
    ],
  },
  {
    id: "nord",
    label: "Nord",
    mode: "dark",
    shiki: "nord",
    pair: "light",
    bg: "#2e3440",
    frame: "#292e39",
    surface: "#343b49",
    surface2: "#3b4252",
    border: "#3b4252",
    text: "#e5e9f0",
    subtext: "#a3abb9",
    accent: "#88c0d0",
    red: "#bf616a",
    spaces: [
      "#81a1c1",
      "#a3be8c",
      "#d08770",
      "#b48ead",
      "#bf616a",
      "#8fbcbb",
      "#ebcb8b",
      "#88c0d0",
    ],
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    mode: "dark",
    shiki: "tokyo-night",
    pair: "light",
    bg: "#1a1b26",
    frame: "#16161e",
    surface: "#1f2335",
    surface2: "#292e42",
    border: "#292e42",
    text: "#c0caf5",
    subtext: "#9aa5ce",
    accent: "#7aa2f7",
    red: "#f7768e",
    spaces: [
      "#7aa2f7",
      "#9ece6a",
      "#ff9e64",
      "#bb9af7",
      "#f7768e",
      "#7dcfff",
      "#e0af68",
      "#73daca",
    ],
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    mode: "dark",
    shiki: "solarized-dark",
    pair: "solarized-light",
    bg: "#002b36",
    frame: "#00252f",
    surface: "#073642",
    surface2: "#0d4250",
    border: "#0d4250",
    text: "#93a1a1",
    subtext: "#839496",
    accent: "#268bd2",
    red: "#dc322f",
    spaces: [
      "#268bd2",
      "#859900",
      "#cb4b16",
      "#6c71c4",
      "#dc322f",
      "#2aa198",
      "#d33682",
      "#b58900",
    ],
  },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    mode: "dark",
    shiki: "rose-pine",
    pair: "rose-pine-dawn",
    bg: "#191724",
    frame: "#1f1d2e",
    surface: "#21202e",
    surface2: "#26233a",
    border: "#26233a",
    text: "#e0def4",
    subtext: "#908caa",
    accent: "#c4a7e7",
    red: "#eb6f92",
    spaces: [
      "#9ccfd8",
      "#31748f",
      "#f6c177",
      "#c4a7e7",
      "#eb6f92",
      "#ebbcba",
      "#908caa",
      "#6e6a86",
    ],
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    mode: "dark",
    shiki: "github-dark-default",
    pair: "github-light",
    bg: "#0d1117",
    frame: "#010409",
    surface: "#161b22",
    surface2: "#21262d",
    border: "#30363d",
    text: "#e6edf3",
    subtext: "#8d96a0",
    accent: "#4493f8",
    red: "#f85149",
    spaces: [
      "#4493f8",
      "#3fb950",
      "#d29922",
      "#a371f7",
      "#f85149",
      "#39c5cf",
      "#db61a2",
      "#db6d28",
    ],
  },
  {
    id: "kanagawa",
    label: "Kanagawa",
    mode: "dark",
    shiki: "kanagawa-wave",
    pair: "light",
    bg: "#1f1f28",
    frame: "#16161d",
    surface: "#2a2a37",
    surface2: "#363646",
    border: "#2a2a37",
    text: "#dcd7ba",
    subtext: "#a6a69c",
    accent: "#7e9cd8",
    red: "#e46876",
    spaces: [
      "#7e9cd8",
      "#98bb6c",
      "#ffa066",
      "#957fb8",
      "#e46876",
      "#7aa89f",
      "#d27e99",
      "#e6c384",
    ],
  },
  {
    id: "everforest-dark",
    label: "Everforest Dark",
    mode: "dark",
    shiki: "everforest-dark",
    pair: "light",
    bg: "#2d353b",
    frame: "#272e33",
    surface: "#343f44",
    surface2: "#3d484d",
    border: "#3d484d",
    text: "#d3c6aa",
    subtext: "#9da9a0",
    accent: "#a7c080",
    red: "#e67e80",
    spaces: [
      "#7fbbb3",
      "#a7c080",
      "#e69875",
      "#d699b6",
      "#e67e80",
      "#83c092",
      "#dbbc7f",
      "#9da9a0",
    ],
  },
  {
    id: "monokai",
    label: "Monokai",
    mode: "dark",
    shiki: "monokai",
    pair: "light",
    bg: "#272822",
    frame: "#1e1f1c",
    surface: "#2e2f29",
    surface2: "#3e3d32",
    border: "#3e3d32",
    text: "#f8f8f2",
    subtext: "#a59f85",
    accent: "#a6e22e",
    red: "#f92672",
    spaces: [
      "#66d9ef",
      "#a6e22e",
      "#fd971f",
      "#ae81ff",
      "#f92672",
      "#e6db74",
      "#a59f85",
      "#f8f8f2",
    ],
  },
];

// The hand-made themes in index.css, for the generated list only.
const BUILT_IN = [
  {
    id: "light",
    label: "Yomu Light",
    mode: "light",
    shiki: "github-light",
    pair: "dark",
    swatch: {
      bg: "#fbfaf7",
      frame: "#f1eee8",
      fg: "#1e1b17",
      accent: "#6b6b6b",
    },
  },
  {
    id: "paper",
    label: "Paper",
    mode: "light",
    shiki: "github-light",
    pair: "dark",
    swatch: {
      bg: "#f6efe2",
      frame: "#e9e1d2",
      fg: "#2a231a",
      accent: "#93856e",
    },
  },
  {
    id: "dark",
    label: "Yomu Dark",
    mode: "dark",
    shiki: "github-dark",
    pair: "light",
    swatch: {
      bg: "#191919",
      frame: "#202020",
      fg: "#ededee",
      accent: "#a3a3a3",
    },
  },
];

// ---- Colour maths ---------------------------------------------------------

const hex = (h) => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const toHex = (rgb) =>
  "#" +
  rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
const luminance = (h) => {
  const ch = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hex(h);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The colour, moved toward `toward` just far enough to reach `min` against
 * every background. Unchanged when it already passes. */
function ensure(color, backgrounds, min, toward) {
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const c = mix(color, toward, t);
    if (backgrounds.every((bg) => ratio(c, bg) >= min)) return c;
  }
  return toward;
}

const rgbList = (h) => hex(h).join(" ");

// ---- Palette -> tokens ----------------------------------------------------

function tokensFor(p) {
  const dark = p.mode === "dark";
  const extreme = dark ? "#ffffff" : "#000000";
  const card = dark ? p.frame : (p.card ?? p.bg);
  const popover = dark ? p.surface2 : card;
  const surfaces = [p.bg, p.surface, p.frame, card, popover];

  const foreground = ensure(p.text, surfaces, 7, extreme);
  const muted = ensure(p.subtext, surfaces, 4.5, foreground);
  const destructive = ensure(p.red, [p.bg, p.surface], 4.5, extreme);
  const onDestructive =
    [p.bg, "#ffffff", "#000000"].find((c) => ratio(c, destructive) >= 4.5) ??
    extreme;
  const honeyInk = ensure(p.accent, [p.bg], 4.5, extreme);
  const ring = ensure(p.accent, [p.bg], 3, extreme);
  const input = ensure(p.border, [p.bg], 3, foreground);
  const spaces = p.spaces.map((c) => ensure(c, [p.bg], 3, extreme));
  const accentForMarks = rgbList(p.accent);
  const shade = dark ? "0 0 0" : rgbList(p.text);

  return {
    "frame-base": p.frame,
    background: p.bg,
    foreground,
    muted: p.surface,
    "muted-foreground": muted,
    card,
    "card-foreground": foreground,
    popover,
    "popover-foreground": foreground,
    border: p.border,
    input,
    primary: foreground,
    "primary-foreground": p.bg,
    secondary: p.surface2,
    "secondary-foreground": foreground,
    accent: p.surface2,
    "accent-foreground": foreground,
    destructive,
    "destructive-foreground": onDestructive,
    honey: p.accent,
    "honey-ink": honeyInk,
    ring,
    "mark-fill": `rgb(${accentForMarks} / ${dark ? 0.18 : 0.2})`,
    "mark-active": `rgb(${accentForMarks} / ${dark ? 0.32 : 0.36})`,
    selection: `rgb(${accentForMarks} / ${dark ? 0.3 : 0.26})`,
    ...Object.fromEntries(spaces.map((c, i) => [`sp-${i}`, c])),
    "sp-inbox": ensure(p.subtext, [p.bg], 3, extreme),
    "reader-ink": foreground,
    scrim: dark ? "rgb(0 0 0 / 0.55)" : `rgb(${shade} / 0.28)`,
    "shadow-sheet": `0 0 0 1px var(--border), 0 8px 24px -12px rgb(${shade} / ${dark ? 0.6 : 0.12})`,
    "shadow-card": `0 0 0 1px var(--border), 0 1px 2px rgb(${shade} / ${dark ? 0.3 : 0.06})`,
    "shadow-card-hover": `0 0 0 1px var(--input), 0 12px 28px -10px rgb(${shade} / ${dark ? 0.7 : 0.2})`,
    "shadow-float": `0 0 0 1px var(--border), 0 4px 10px -4px rgb(${shade} / ${dark ? 0.5 : 0.12}), 0 22px 50px -12px rgb(${shade} / ${dark ? 0.75 : 0.26})`,
  };
}

// ---- Output ---------------------------------------------------------------

const blocks = PALETTES.map((p) => {
  const tokens = tokensFor(p);
  const fallback = p.mode === "dark" ? "dark" : "light";
  const lines = Object.entries(tokens).map(([k, v]) => `  --${k}: ${v};`);
  return [
    `/* ${p.label} */`,
    `:root[data-theme="${p.id}"] {`,
    ...lines,
    `}`,
    `:root[data-theme="${p.id}"] .shiki,`,
    `:root[data-theme="${p.id}"] .shiki span {`,
    `  color: var(--shiki-${p.id}, var(--shiki-${fallback}));`,
    `}`,
  ].join("\n");
}).join("\n\n");

const header = `/* The named colour themes (Catppuccin, One Dark, Gruvbox, ...). Generated
 * by scripts/generate-themes.mjs; do not edit by hand. Loaded after
 * index.css, so these override its defaults. */
`;
writeFileSync(new URL("src/themes.css", ROOT), `${header}\n${blocks}\n`);

const meta = [
  ...BUILT_IN,
  ...PALETTES.map((p) => {
    const t = tokensFor(p);
    return {
      id: p.id,
      label: p.label,
      mode: p.mode,
      shiki: p.shiki,
      pair: p.pair,
      swatch: { bg: p.bg, frame: p.frame, fg: t.foreground, accent: p.accent },
    };
  }),
];
const shikiNames = [...new Set(meta.map((m) => m.shiki))];

const ts = `// Generated by scripts/generate-themes.mjs; do not edit by hand.

/** Every colour theme, light ones first. */
export const THEMES = ${JSON.stringify(meta, null, 2)} as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type ThemeMeta = (typeof THEMES)[number];

/** Loads a theme's code colours (Shiki), only when it is first needed. */
export const SHIKI_THEMES: Record<string, () => Promise<unknown>> = {
${shikiNames.map((n) => `  "${n}": () => import("shiki/themes/${n}.mjs"),`).join("\n")}
};
`;
writeFileSync(new URL("src/lib/themes.ts", ROOT), ts);

console.log(`${PALETTES.length} generated themes, ${meta.length} in all.`);

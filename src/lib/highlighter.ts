import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { SHIKI_THEMES, THEMES } from "@/lib/themes";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Fine grained imports instead of the `shiki` convenience package: only
// the languages and themes this app actually uses ship in the bundle,
// and the JS regex engine avoids pulling in the ~600kB oniguruma wasm.
const LANG_LOADERS = {
  yaml: () => import("shiki/langs/yaml.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  dockerfile: () => import("shiki/langs/docker.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
} as const;

type KnownLang = keyof typeof LANG_LOADERS;
const KNOWN_LANGS = new Set(Object.keys(LANG_LOADERS));

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
      langs: Object.values(LANG_LOADERS).map((load) => load()),
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

/**
 * Renders a code string to highlighted HTML with the light and dark code
 * colours baked in as CSS variables (picked by the `.dark` class), plus the
 * active colour theme's own (picked by `data-theme`, see index.css), so a
 * light/dark switch needs no re-render and a named theme gets its real code
 * colours. Its Shiki theme is loaded the first time it is needed.
 */
export async function highlightCode(
  code: string,
  language: string | null,
  themeId: string | null = null,
): Promise<string> {
  const highlighter = await getHighlighter();
  const lang: KnownLang | "text" =
    language && KNOWN_LANGS.has(language) ? (language as KnownLang) : "text";

  const themes: Record<string, string> = {
    light: "github-light",
    dark: "github-dark",
  };
  const meta = THEMES.find((t) => t.id === themeId);
  if (meta && meta.id !== "light" && meta.id !== "dark") {
    const name = meta.shiki;
    if (!highlighter.getLoadedThemes().includes(name)) {
      const load = SHIKI_THEMES[name];
      if (load) {
        try {
          const mod = (await load()) as {
            default: Parameters<HighlighterCore["loadTheme"]>[0];
          };
          await highlighter.loadTheme(mod.default);
        } catch {
          // Unknown or failed theme: the light/dark colours still apply.
        }
      }
    }
    if (highlighter.getLoadedThemes().includes(name)) themes[meta.id] = name;
  }

  return highlighter.codeToHtml(code, {
    lang: lang === "text" ? "text" : lang,
    themes,
    defaultColor: false,
  });
}

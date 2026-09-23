import { createHighlighterCore, type HighlighterCore } from "shiki/core";
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
 * Renders a code string to highlighted HTML with both a light and dark
 * theme baked in as CSS variables (toggled by the `.dark` class), so a
 * theme switch doesn't need a re-render.
 */
export async function highlightCode(
  code: string,
  language: string | null,
): Promise<string> {
  const highlighter = await getHighlighter();
  const lang: KnownLang | "text" =
    language && KNOWN_LANGS.has(language) ? (language as KnownLang) : "text";

  return highlighter.codeToHtml(code, {
    lang: lang === "text" ? "text" : lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}

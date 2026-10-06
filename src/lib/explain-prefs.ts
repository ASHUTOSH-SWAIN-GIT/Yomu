/**
 * Personalization for how the agent explains things (A4): a skill-level
 * setting and a code-example preference, applied to every explain/question
 * prompt. Same shape and localStorage pattern as the reader preferences in
 * lib/appearance.ts. The instruction-mapping functions live here (not in
 * lib/prompt.ts) so that module stays a plain, store-free renderer that
 * doesn't need to know what a "level" means — see stores/chat-store.ts,
 * which calls these and passes the resulting sentences in as plain text.
 */

export type ExplainLevel = "beginner" | "balanced" | "expert";
export type CodeExamplePref = "always" | "helpful" | "never";

export interface ExplainPrefs {
  level: ExplainLevel;
  codeExamples: CodeExamplePref;
  /** The user's own instruction for every answer ("be thorough", "answer in
   * Hindi"); empty for none. */
  style: string;
}

/** Longest answer style kept, so it can't swamp the question. */
export const STYLE_MAX = 300;

export const DEFAULT_EXPLAIN_PREFS: ExplainPrefs = {
  level: "balanced",
  codeExamples: "helpful",
  style: "",
};

export const EXPLAIN_PREFS_KEY = "yomu-explain-prefs";

const LEVELS: ExplainLevel[] = ["beginner", "balanced", "expert"];
const CODE_EXAMPLE_PREFS: CodeExamplePref[] = ["always", "helpful", "never"];

/** Reads stored preferences, ignoring anything invalid field by field so a
 * bad or old value can never break a prompt. */
export function parseExplainPrefs(
  raw: string | null | undefined,
): ExplainPrefs {
  let data: Partial<Record<keyof ExplainPrefs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // Corrupt JSON: fall back to defaults.
  }
  return {
    level: LEVELS.includes(data.level as ExplainLevel)
      ? (data.level as ExplainLevel)
      : DEFAULT_EXPLAIN_PREFS.level,
    codeExamples: CODE_EXAMPLE_PREFS.includes(
      data.codeExamples as CodeExamplePref,
    )
      ? (data.codeExamples as CodeExamplePref)
      : DEFAULT_EXPLAIN_PREFS.codeExamples,
    style:
      typeof data.style === "string"
        ? data.style.trim().slice(0, STYLE_MAX)
        : DEFAULT_EXPLAIN_PREFS.style,
  };
}

/** `null` for "balanced": today's default tone needs no extra instruction. */
export function levelInstruction(level: ExplainLevel): string | null {
  switch (level) {
    case "beginner":
      return "The developer is new to this topic: explain plainly, define any jargon, and don't assume prior knowledge.";
    case "expert":
      return "The developer is experienced: skip the basics, be technical and concise, and focus on nuance or gotchas.";
    case "balanced":
      return null;
  }
}

/** `null` for "helpful": matches the default "only when it helps" wording
 * already in the task instruction, so nothing extra is needed. */
export function codeExamplesInstruction(pref: CodeExamplePref): string | null {
  switch (pref) {
    case "always":
      return "Always include a short code example.";
    case "never":
      return "Do not include a code example unless the developer explicitly asks for one.";
    case "helpful":
      return null;
  }
}

/** The user's own instruction, passed on as they wrote it. */
export function styleInstruction(style: string): string | null {
  const text = style.trim();
  return text ? `Also follow this instruction from the reader: ${text}` : null;
}

/** Every extra instruction these preferences add, in order, for a caller to
 * append to the prompt's task line (empty when everything is default). */
export function explainPrefInstructions(prefs: ExplainPrefs): string[] {
  return [
    levelInstruction(prefs.level),
    codeExamplesInstruction(prefs.codeExamples),
    styleInstruction(prefs.style),
  ].filter((line): line is string => line !== null);
}

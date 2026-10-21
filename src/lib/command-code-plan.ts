import type { AgentModel } from "@/types/agent";

/**
 * Which Command Code models a subscription includes.
 *
 * Command Code reports its whole catalog over ACP — `session/new` returns
 * ~94 models and `commandcode --list-models` prints 96 — so the picker would
 * otherwise offer models the account cannot use, which fail at prompt time.
 * The catalog (commandcode.ai/docs, the 2026-10 snapshot) says per model the
 * cheapest plan that serves it; that is all the data here.
 */

/** The tiers, cheapest first: a plan includes every tier below it. */
export type CommandCodePlan = "go" | "goat" | "pro" | "max";

const RANK: Record<CommandCodePlan, number> = {
  go: 0,
  goat: 1,
  pro: 2,
  max: 3,
};

/**
 * Only the models that need more than the cheapest plan, and which plan that
 * is. Everything else in the catalog is served on every plan, so it is left
 * out. The catalog adds models over time; one that is missing here is simply
 * kept (see `modelsInPlan`) rather than hidden on a guess.
 *
 * Source: the catalog's "Min plan" column.
 */
const MIN_PLAN: Record<string, CommandCodePlan> = {
  "Qwen/Qwen3.8-Max-Prime": "goat",
  "claude-haiku-5-5": "goat",
  "claude-sonnet-5-5": "goat",
  "google/gemini-3.7-flash": "goat",
  "google/gemini-3.8-flash": "goat",
  "gpt-5.6-sol": "goat",
  "meta/muse-spark-1.2": "goat",
  "meta/muse-spark-1.3": "goat",
  "xai/grok-4.6": "goat",
  "xai/grok-4.7": "goat",
  "xiaomi/mimo-v2.6-pro-ultraspeed": "goat",
  "claude-haiku-4-5-20251001": "pro",
  "claude-sonnet-4-6": "pro",
  "claude-sonnet-5": "pro",
  "google/gemini-3.1-flash-lite": "pro",
  "google/gemini-3.5-flash": "pro",
  "google/gemini-3.5-flash-lite": "pro",
  "google/gemini-3.6-flash": "pro",
  "google/gemini-4-argon": "pro",
  "gpt-5.3-codex": "pro",
  "gpt-5.4": "pro",
  "gpt-5.4-mini": "pro",
  "gpt-5.5": "pro",
  "gpt-5.6-terra": "pro",
  "gpt-6-sol": "pro",
  "meta/muse-spark-1.1": "pro",
  "claude-fable-5": "max",
  "claude-fable-5-1": "max",
  "claude-opus-4-7": "max",
  "claude-opus-4-8": "max",
  "claude-opus-5": "max",
  "claude-opus-5-5": "max",
  "gpt-6-astra": "max",
  "gpt-6.1-sol": "max",
  "meta/muse-wonder-1.0": "max",
  "sakana/fugu-ultra": "max",
};

/** Where the reader's plan is kept; absent means "show every model". */
export const PLAN_KEY = "yomu-command-code-plan";

const PLANS: CommandCodePlan[] = ["go", "goat", "pro", "max"];

/** The plan a stored value names, or `null` for none (and for anything
 * unreadable, so a bad value can never hide models). */
export function parseCommandCodePlan(
  raw: string | null | undefined,
): CommandCodePlan | null {
  return PLANS.includes(raw as CommandCodePlan)
    ? (raw as CommandCodePlan)
    : null;
}

/**
 * What the picker should offer on `plan`: `null` leaves the agent's list as it
 * is, since Yomu cannot read the reader's plan and will not guess one.
 * Otherwise models the plan does not include are dropped; a model this file
 * knows nothing about is kept, because hiding one the reader can use is worse
 * than showing one they cannot.
 */
export function modelsInPlan(
  models: AgentModel[],
  plan: CommandCodePlan | null,
): AgentModel[] {
  if (!plan) return models;
  return models.filter((model) => {
    const needs = MIN_PLAN[model.id];
    return !needs || RANK[needs] <= RANK[plan];
  });
}

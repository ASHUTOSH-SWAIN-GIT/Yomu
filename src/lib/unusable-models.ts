import { agentId } from "@/lib/agents";
import { readStorage, writeStorage } from "@/lib/storage";
import type { AgentConfig, AgentModel } from "@/types/agent";

/**
 * Models an account has been refused.
 *
 * An agent only finds out that a plan cannot use a model when a prompt is
 * turned down ("model is not supported on your plan"), and some agents offer
 * their whole catalog regardless (Command Code does; command-code-plan.ts
 * filters it up front). Remembering the refusal keeps a model that cannot run
 * out of the picker from then on, for every agent, without asking the agent
 * for anything it does not report.
 */

const KEY = "yomu-unusable-models";

/**
 * Which agent a list belongs to. A preset's own id is enough, since its
 * command cannot change; a hand-made agent adds its command, because two of
 * them are both just `custom`.
 */
export function unusableKey(config: AgentConfig): string {
  return config.kind === "codex"
    ? "codex"
    : `${agentId(config)}:${config.command}`;
}

type Stored = Record<string, string[]>;

function parse(raw: string | null): Stored {
  try {
    const data: unknown = JSON.parse(raw ?? "{}");
    if (!data || typeof data !== "object") return {};
    const stored: Stored = {};
    for (const [agent, ids] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (Array.isArray(ids)) {
        stored[agent] = ids.filter(
          (id): id is string => typeof id === "string",
        );
      }
    }
    return stored;
  } catch {
    return {};
  }
}

/** The models this agent has refused, including in earlier sessions. */
export function readUnusable(key: string): string[] {
  return parse(readStorage(KEY))[key] ?? [];
}

/** Remembers one more refusal and returns the agent's whole list. */
export function rememberUnusable(key: string, id: string): string[] {
  const all = parse(readStorage(KEY));
  const mine = [...new Set([...(all[key] ?? []), id])];
  writeStorage(KEY, JSON.stringify({ ...all, [key]: mine }));
  return mine;
}

/** The list without the models this account has been refused. */
export function withoutUnusable(
  models: AgentModel[],
  unusable: string[],
): AgentModel[] {
  return unusable.length
    ? models.filter((model) => !unusable.includes(model.id))
    : models;
}

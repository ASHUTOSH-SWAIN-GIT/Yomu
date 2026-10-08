import type { AgentEvent } from "@/types/agent";

export interface ProgressStep {
  id: string;
  title: string;
  status: string;
}

/** What the agent is doing besides writing the answer: its thinking, the
 * steps it takes and its plan. Lasts for one turn. */
export interface Progress {
  thinking: string;
  steps: ProgressStep[];
  plan: { content: string; status: string }[];
  /** Words of the model's context window used so far, when it says. */
  usage: { used: number; size: number } | null;
}

export const emptyProgress: Progress = {
  thinking: "",
  steps: [],
  plan: [],
  usage: null,
};

const YOMU_STEPS: Record<string, string> = {
  search_library: "Searching your library",
  list_articles: "Listing your saved blogs",
  list_collections: "Looking at your collections",
  read_article: "Reading a saved blog",
  get_comments: "Reading your comments",
};

/** What a step is called to the reader. Agents name a call to one of Yomu's
 * own tools `mcp.yomu.<tool>`; anything else is shown as it came. */
export function stepTitle(raw: string): string {
  const tool = /^mcp\.yomu\.(\w+)$/.exec(raw)?.[1];
  return (tool && YOMU_STEPS[tool]) || raw;
}

/** Folds one agent event into the progress; events about the answer itself
 * leave it as it was (the same object, so nothing re-renders). */
export function applyProgress(p: Progress, event: AgentEvent): Progress {
  switch (event.kind) {
    case "thought":
      return { ...p, thinking: p.thinking + event.text };
    case "step": {
      const at = p.steps.findIndex((s) => s.id === event.id);
      if (at === -1) {
        return {
          ...p,
          steps: [
            ...p.steps,
            {
              id: event.id,
              title: stepTitle(event.title ?? "Working"),
              status: event.status ?? "pending",
            },
          ],
        };
      }
      // An update only carries what changed.
      const steps = [...p.steps];
      steps[at] = {
        ...steps[at],
        title: event.title ? stepTitle(event.title) : steps[at].title,
        status: event.status ?? steps[at].status,
      };
      return { ...p, steps };
    }
    case "plan":
      return { ...p, plan: event.entries };
    case "usage":
      return { ...p, usage: { used: event.used, size: event.size } };
    default:
      return p;
  }
}

/** True when there is anything worth showing. */
export function hasProgress(p: Progress): boolean {
  return p.thinking.length > 0 || p.steps.length > 0 || p.plan.length > 0;
}

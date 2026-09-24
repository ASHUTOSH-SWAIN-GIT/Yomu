import type { Diagnosis } from "@/types/agent";

export type SetupStepId = "node" | "codex" | "login";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  done: boolean;
  /** What the user sees for this step. */
  detail: string;
  /** A terminal command that fixes it, shown with a copy button. */
  command?: string;
  /** False when an earlier step must be finished first. */
  actionable: boolean;
}

export const isReady = (d: Diagnosis) =>
  d.node !== null && d.codex !== null && d.loggedIn;

/** The setup checklist for a diagnosis. Steps are ordered, and a step is
 * only actionable once the ones before it are done (you can't sign in to a
 * CLI that isn't installed). */
export function setupSteps(d: Diagnosis): SetupStep[] {
  return [
    {
      id: "node",
      title: "Node.js",
      done: d.node !== null,
      detail: d.node
        ? `Found ${d.node}`
        : "Needed to run the Codex adapter (npx). Install Node.js 20 or newer.",
      command: "brew install node",
      actionable: true,
    },
    {
      id: "codex",
      title: "Codex CLI",
      done: d.codex !== null,
      detail: d.codex
        ? `Found ${d.codex}`
        : "Yomu talks to your local Codex, using your ChatGPT plan. No API key needed.",
      command: "npm install -g @openai/codex",
      actionable: true,
    },
    {
      id: "login",
      title: "Sign in with ChatGPT",
      done: d.loggedIn,
      detail: d.loggedIn
        ? "Signed in"
        : d.codex
          ? "Opens your browser to sign in. Yomu never sees your token."
          : "Install Codex first.",
      actionable: d.codex !== null,
    },
  ];
}

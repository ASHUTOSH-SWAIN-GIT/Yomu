import { SUMMARY_LABEL } from "@/lib/scope";

/**
 * The one-tap questions in the Ask bar. `message` is what is stored and
 * shown as the question; `prompt` is the instruction the agent receives.
 */
export interface QuickAction {
  id: string;
  label: string;
  message: string;
  prompt: string;
}

/** Shown while a passage is attached. The question about the passage is the
 * prompt itself (it reads naturally as a margin note's heading). */
export const PASSAGE_ACTIONS: QuickAction[] = [
  {
    id: "simpler",
    label: "Simpler",
    message: "Explain that more simply, as if I'm new to this.",
    prompt: "Explain that more simply, as if I'm new to this.",
  },
  {
    id: "deeper",
    label: "Go deeper",
    message: "Go deeper: cover the details and edge cases.",
    prompt: "Go deeper: cover the details and edge cases.",
  },
  {
    id: "example",
    label: "Example",
    message: "Show a short concrete example.",
    prompt: "Show a short concrete example.",
  },
];

/** Shown when nothing is attached: questions about the whole article. */
export const ARTICLE_ACTIONS: QuickAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    message: SUMMARY_LABEL,
    prompt:
      "Summarize it: a few bullet points with the key ideas, then one sentence on who should read it and why.",
  },
  {
    id: "takeaways",
    label: "Key takeaways",
    message: "Key takeaways",
    prompt:
      "List the 3 to 5 most important takeaways a developer should remember, each in one sentence, most important first.",
  },
  {
    id: "quiz",
    label: "Quiz me",
    message: "Quiz me",
    prompt:
      "Write a short quiz of 4 questions that tests understanding of this article (mostly conceptual, one practical). Give the questions first, then an answer key under an Answers heading.",
  },
];

/** The instruction behind a stored article question. A quick action's
 * stored message maps back to its prompt (so Regenerate and Retry work after
 * a restart); anything else is the developer's own question, sent as is. */
export function articleInstruction(message: string): string {
  return ARTICLE_ACTIONS.find((a) => a.message === message)?.prompt ?? message;
}

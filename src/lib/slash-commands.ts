import { ARTICLE_ACTIONS } from "@/lib/quick-actions";

/** A shortcut typed in the message box: `/summarize` sends its `text`. */
export interface SlashCommand {
  name: string;
  hint: string;
  /** What is sent (and shown as the question). */
  text: string;
}

/** For the chat beside a blog: the quick questions about the whole article.
 * `text` is the stored message, which maps back to its full instruction. */
export const ARTICLE_COMMANDS: SlashCommand[] = ARTICLE_ACTIONS.map((a) => ({
  name: { summarize: "summarize", takeaways: "takeaways", quiz: "quiz" }[
    a.id
  ] as string,
  hint: a.label,
  text: a.message,
}));

/** For a paper, after the article ones: how it was done, what it leaves
 * out, and what its figures and tables show. */
export const PAPER_COMMANDS: SlashCommand[] = [
  {
    name: "methods",
    hint: "How the work was done",
    text: "Explain the paper's methods: what the authors built or did, and how, step by step.",
  },
  {
    name: "limitations",
    hint: "What the paper leaves out",
    text: "What are this paper's limitations, both the ones it states and the ones it does not?",
  },
  {
    name: "figures",
    hint: "What the figures and tables show",
    text: "Walk me through the paper's figures and tables: what each one shows and why it matters to the argument.",
  },
];

/** For the chat about everything you have saved. */
export const LIBRARY_COMMANDS: SlashCommand[] = [
  {
    name: "recent",
    hint: "Summarize my latest reads",
    text: "Summarize my most recent reads",
  },
  {
    name: "topics",
    hint: "What my saved articles cover",
    text: "What topics do my saved blogs cover, and which have I read most about?",
  },
  {
    name: "disagree",
    hint: "Where my articles disagree",
    text: "Which of my articles disagree with each other?",
  },
];

/** The commands to offer for what has been typed: only while it is a single
 * `/word` at the start, narrowed by what follows the slash. */
export function matchCommands(
  input: string,
  commands: SlashCommand[],
): SlashCommand[] {
  if (!/^\/[\w-]*$/.test(input)) return [];
  const typed = input.slice(1).toLowerCase();
  return commands.filter((c) => c.name.startsWith(typed));
}

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

/** For the chat about everything you have saved. */
export const LIBRARY_COMMANDS: SlashCommand[] = [
  {
    name: "recent",
    hint: "Summarize my latest reads",
    text: "Summarize my most recent reads",
  },
  {
    name: "topics",
    hint: "What my saved blogs cover",
    text: "What topics do my saved blogs cover, and which have I read most about?",
  },
  {
    name: "disagree",
    hint: "Where my blogs disagree",
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

import { parseImageQuote } from "@/lib/images";
import { firstSentence } from "@/lib/text";
import type { ChatMessage } from "@/stores/chat-store";

/** One question and the answer(s) that followed it. */
export interface Exchange {
  question: ChatMessage;
  answers: ChatMessage[];
}

/** Groups a flat chat into exchanges: each user message starts one, and the
 * assistant messages after it belong to it. Assistant messages with no
 * question before them (never expected) are ignored. */
export function groupExchanges(messages: ChatMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      exchanges.push({ question: message, answers: [] });
    } else {
      exchanges[exchanges.length - 1]?.answers.push(message);
    }
  }
  return exchanges;
}

/** The exchange to show in the answer sheet: the one for `highlightId` if
 * given and found, otherwise the latest. */
export function pickExchange(
  exchanges: Exchange[],
  highlightId: string | null,
): Exchange | null {
  if (highlightId) {
    const found = [...exchanges]
      .reverse()
      .find((e) => e.question.highlightId === highlightId);
    if (found) return found;
  }
  return exchanges[exchanges.length - 1] ?? null;
}

/** A passage explained earlier in the article, condensed for the prompt
 * (see lib/prompt.ts's `priorExplanations` option): the quoted passage and
 * a one-sentence gist of its answer. */
export interface PriorExplanation {
  quote: string;
  summary: string;
}

/**
 * Other passages already explained in this article, most recent last. Only
 * needed when a session had to be recreated (see chat-store): a *continuing*
 * session already has every prior exchange verbatim in its own history, so
 * this is for the one case where that history is gone — telling a fresh
 * session what was already covered elsewhere, so it doesn't repeat itself
 * or contradict an earlier answer. Excludes the passage currently being
 * asked about, image questions (no short text quote to show), summaries,
 * and anything that hasn't been answered yet.
 */
export function priorExplanations(
  messages: ChatMessage[],
  excludeHighlightId: string | undefined,
  limit = 5,
): PriorExplanation[] {
  return groupExchanges(messages)
    .filter(
      (e) =>
        e.question.highlightId !== undefined &&
        e.question.highlightId !== excludeHighlightId &&
        e.question.quote !== undefined &&
        !parseImageQuote(e.question.quote) &&
        e.answers.length > 0,
    )
    .slice(-limit)
    .map((e) => ({
      quote: e.question.quote!,
      summary: firstSentence(e.answers[e.answers.length - 1].text),
    }));
}

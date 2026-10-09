import { parseImageQuote } from "@/lib/images";
import { EXPLAIN_LABEL } from "@/lib/scope";
import { firstSentence } from "@/lib/text";
import type { ChatMessage } from "@/stores/chat-store";
import type { Highlight } from "@/types/library";

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

/** A passage that was asked about, with what was answered: shown beside
 * the words. */
export interface PassageAnswer {
  highlight: Highlight;
  /** The reader's own question; null when the passage was just explained. */
  question: string | null;
  answer: string;
}

/** The answers to questions about passages, in the order they were asked.
 * A passage with no answer yet (or none that arrived) is left out. */
export function passageAnswers(
  highlights: Highlight[],
  messages: ChatMessage[],
): PassageAnswer[] {
  const asked = new Map(
    groupExchanges(messages)
      .filter((e) => e.question.highlightId !== undefined)
      .map((e) => [e.question.highlightId as string, e]),
  );
  return highlights.flatMap((highlight) => {
    const exchange = asked.get(highlight.id);
    const answer = exchange?.answers.map((a) => a.text).join("\n\n") ?? "";
    if (!exchange || !answer.trim()) return [];
    const question = exchange.question.text;
    return [
      {
        highlight,
        question: question === EXPLAIN_LABEL ? null : question,
        answer,
      },
    ];
  });
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

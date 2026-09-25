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

import { parseImageQuote } from "@/lib/images";
import { useCommentsStore } from "@/stores/comments-store";
import type { Highlight } from "@/types/library";

/** Keeps an answer as a comment on the words it was about, so it stays beside
 * them in the article. A picture has no words, so its comment is on the
 * picture as a whole. */
export async function saveAnswerAsComment(
  highlight: Highlight,
  answer: string,
): Promise<void> {
  const comments = useCommentsStore.getState();
  const wholeBlock = parseImageQuote(highlight.text) !== null;
  comments.startDraft({
    blockIndex: highlight.blockIndex,
    start: wholeBlock ? 0 : highlight.startOffset,
    end: wholeBlock ? 0 : highlight.endOffset,
    quote: wholeBlock ? "" : highlight.text,
  });
  await comments.saveDraft(answer);
}

import { blockText } from "@/lib/article-text";
import { parseImageQuote } from "@/lib/images";
import type { Block } from "@/types/article";
import type { Highlight, StoredArticle } from "@/types/library";

// Below this many characters the whole article is sent as context;
// above it, only the section around the selection.
const FULL_ARTICLE_MAX_CHARS = 8000;
const NEARBY_BLOCKS = 3;

function sectionHeading(blocks: Block[], blockIndex: number): string | null {
  for (let i = blockIndex; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === "heading") return block.text;
  }
  return null;
}

function contextFor(article: StoredArticle, blockIndex: number): string {
  const { blocks } = article;
  const full = blocks.map(blockText).filter(Boolean).join("\n\n");
  if (full.length <= FULL_ARTICLE_MAX_CHARS) return full;

  const from = Math.max(0, blockIndex - NEARBY_BLOCKS);
  const to = Math.min(blocks.length, blockIndex + NEARBY_BLOCKS + 1);
  return blocks.slice(from, to).map(blockText).filter(Boolean).join("\n\n");
}

/**
 * Builds the prompt for a highlight. Without `question` it asks for an
 * explanation; with one it's a follow-up that re-supplies the context, which
 * is only needed when a session had to be recreated (see chat-store).
 */
export function buildPrompt(
  article: StoredArticle,
  highlight: Highlight,
  question?: string,
  /** "followup": a question in an ongoing conversation. "question": the
   * first thing asked about a freshly selected passage. */
  kind: "followup" | "question" = "followup",
): string {
  const image = parseImageQuote(highlight.text);
  const section = sectionHeading(article.blocks, highlight.blockIndex);
  const framing = kind === "question" ? "asks" : "has a follow-up question";
  const task = image
    ? question
      ? `The developer ${framing} about the attached image:\n${question}`
      : "Explain the attached image for a developer: say what it shows and how it relates to the surrounding text of the article. Be concise, and describe any labels, axes or code visible in it."
    : question
      ? `The developer ${framing} about this passage:\n${question}`
      : "Explain the selected passage for a developer: be concise, refer back to the article where relevant, and include a short code example only when it helps.";

  return [
    "You are helping a developer read a technical article. Answer from the text below and your own knowledge. Do not use tools, read files, or browse. Reply in Markdown.",
    "",
    `Article: ${article.title} (${article.url})`,
    section ? `Section: ${section}` : null,
    "",
    "Article context:",
    contextFor(article, highlight.blockIndex),
    "",
    image
      ? `Selected image: ${image.alt || "(no alt text)"}. It is attached to this message.`
      : "Selected passage:",
    ...(image ? [] : [`"""\n${highlight.text}\n"""`]),
    "",
    task,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// Long articles are cut to keep the request a sensible size.
const SUMMARY_MAX_CHARS = 30000;

/** Prompt for "Summarize this article" (no selection needed). */
export function buildSummaryPrompt(article: StoredArticle): string {
  const body = article.blocks.map(blockText).filter(Boolean).join("\n\n");
  const truncated = body.length > SUMMARY_MAX_CHARS;
  return [
    "You are helping a developer decide what to take from a technical article. Use only the text below. Do not use tools, read files, or browse. Reply in Markdown.",
    "",
    `Article: ${article.title} (${article.url})`,
    "",
    body.slice(0, SUMMARY_MAX_CHARS) +
      (truncated ? "\n\n[article truncated]" : ""),
    "",
    "Summarize it: a few bullet points with the key ideas, then one sentence on who should read it and why.",
  ].join("\n");
}

import { blockText } from "@/lib/article-text";
import type { PriorExplanation } from "@/lib/exchanges";
import { parseImageQuote } from "@/lib/images";
import type { Block } from "@/types/article";
import type { Highlight, RelatedArticle, StoredArticle } from "@/types/library";

// Below this many characters the whole article is sent as context;
// above it, only the section around the selection.
const FULL_ARTICLE_MAX_CHARS = 8000;
const NEARBY_BLOCKS = 3;

type HeadingBlock = Extract<Block, { type: "heading" }>;

function headings(blocks: Block[]): { block: HeadingBlock; index: number }[] {
  return blocks.flatMap((block, index) =>
    block.type === "heading" ? [{ block, index }] : [],
  );
}

function sectionHeading(blocks: Block[], blockIndex: number): string | null {
  for (let i = blockIndex; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === "heading") return block.text;
  }
  return null;
}

/** Where the passage sits in the article's structure, e.g.
 * `Section 3 of 7: Borrowing. Other sections: Intro, Ownership, ...`.
 * Omitted for very short articles (fewer than two headings) — not worth
 * the tokens when there's nothing to place the passage relative to. */
function tableOfContents(blocks: Block[], blockIndex: number): string | null {
  const all = headings(blocks);
  if (all.length < 2) return null;

  const upToHere = all.filter((h) => h.index <= blockIndex);
  const position = upToHere.length > 0 ? upToHere.length : null;
  const names = all.map((h) => h.block.text);
  const where =
    position !== null
      ? `Section ${position} of ${all.length}. `
      : "(before the first section) ";
  return `${where}All sections: ${names.join(", ")}.`;
}

function fullArticleText(blocks: Block[]): string {
  return blocks.map(blockText).filter(Boolean).join("\n\n");
}

/** Whether the whole article is short enough to send in full (used both to
 * build the context and to decide whether skipping a resend is safe: for a
 * long article, `contextFor` sends only nearby blocks, which differ per
 * passage and are never skipped). */
export function articleFitsInFull(blocks: Block[]): boolean {
  return fullArticleText(blocks).length <= FULL_ARTICLE_MAX_CHARS;
}

/**
 * The article text to include. `null` means "omit the context section
 * entirely" — only possible when the full article fits and the caller says
 * it was already sent earlier in this live session, so resending it would
 * just spend tokens the model doesn't need again.
 */
function contextFor(
  article: StoredArticle,
  blockIndex: number,
  skipIfAlreadySent: boolean,
): string | null {
  const { blocks } = article;
  if (articleFitsInFull(blocks)) {
    return skipIfAlreadySent ? null : fullArticleText(blocks);
  }
  const from = Math.max(0, blockIndex - NEARBY_BLOCKS);
  const to = Math.min(blocks.length, blockIndex + NEARBY_BLOCKS + 1);
  return blocks.slice(from, to).map(blockText).filter(Boolean).join("\n\n");
}

export interface PromptOptions {
  /** The user's own question; absent means "just explain this passage." */
  question?: string;
  /** "followup": a question in an ongoing conversation. "question": the
   * first thing asked about a freshly selected passage. */
  kind?: "followup" | "question";
  /** True once the full article body has already been sent earlier in this
   * same live ACP session (see chat-store's per-session tracking) — skips
   * resending it, since the model already has it in its own context. Has
   * no effect on a long article, whose nearby-block excerpt differs by
   * passage and is always sent. */
  fullContextAlreadySent?: boolean;
  /** Other passages already explained in this article (see
   * lib/exchanges.ts's `priorExplanations`). Only meaningful for a fresh
   * session — a continuing one already has these verbatim in its own
   * history, so the caller only passes this when the session is fresh. */
  priorExplanations?: PriorExplanation[];
  /** Snippets from OTHER saved articles that might be relevant (see
   * lib/db.ts's `relatedArticles`) — explicitly secondary: the open
   * article is always the primary source, these are only for the model to
   * draw a connection to if it's genuinely relevant. */
  relatedArticles?: RelatedArticle[];
  /** Extra sentences to append to the task instruction (personalization,
   * see lib/explain-prefs.ts). Plain strings: this module doesn't need to
   * know what setting produced them, just where to put them. */
  personalizationNotes?: string[];
}

/**
 * Builds the prompt for a highlight. Without `question` it asks for an
 * explanation; with one it's a question about that specific passage
 * ("question") or a follow-up in an ongoing conversation ("followup",
 * which re-supplies context only when a session had to be recreated — see
 * chat-store).
 */
export function buildPrompt(
  article: StoredArticle,
  highlight: Highlight,
  options: PromptOptions = {},
): string {
  const {
    question,
    kind = "followup",
    fullContextAlreadySent = false,
    priorExplanations = [],
    relatedArticles = [],
    personalizationNotes = [],
  } = options;
  const image = parseImageQuote(highlight.text);
  const section = sectionHeading(article.blocks, highlight.blockIndex);
  const toc = tableOfContents(article.blocks, highlight.blockIndex);
  const framing = kind === "question" ? "asks" : "has a follow-up question";
  const baseTask = image
    ? question
      ? `The developer ${framing} about the attached image:\n${question}`
      : "Explain the attached image for a developer: say what it shows and how it relates to the surrounding text of the article. Be concise, and describe any labels, axes or code visible in it."
    : question
      ? `The developer ${framing} about this passage:\n${question}`
      : "Explain the selected passage for a developer: be concise, refer back to the article where relevant, and include a short code example only when it helps.";
  const task = [baseTask, ...personalizationNotes].join("\n");

  const context = contextFor(
    article,
    highlight.blockIndex,
    fullContextAlreadySent,
  );
  const covered =
    priorExplanations.length > 0
      ? priorExplanations.map((p) => `- "${p.quote}" — ${p.summary}`).join("\n")
      : null;
  const related =
    relatedArticles.length > 0
      ? relatedArticles.map((r) => `- "${r.title}": ${r.snippet}`).join("\n")
      : null;

  return [
    "You are helping a developer read a technical article. Answer from the text below and your own knowledge — quote exact phrases from the article when it helps ground your answer, rather than paraphrasing loosely. Do not use tools, read files, or browse. Reply in Markdown.",
    "",
    `Article: ${article.title} (${article.url})`,
    toc,
    section ? `Section: ${section}` : null,
    "",
    context !== null ? "Article context:" : null,
    context,
    context !== null ? "" : null,
    covered !== null ? "Already explained elsewhere in this article:" : null,
    covered,
    covered !== null ? "" : null,
    related !== null
      ? "You might also know this from other articles the developer has saved. Only mention these if they're genuinely relevant — the article above is the primary source:"
      : null,
    related,
    related !== null ? "" : null,
    image
      ? `Selected image: ${image.alt || "(no alt text)"}. It is attached to this message.`
      : "Selected passage:",
    ...(image ? [] : [`"""\n${highlight.text}\n"""`]),
    "",
    task,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

// Long articles are cut to keep the request a sensible size.
const ARTICLE_MAX_CHARS = 30000;

/** Prompt for a question about the whole article (summary, takeaways, quiz
 * or a free-form question): the article text, then the instruction. */
export function buildArticlePrompt(
  article: StoredArticle,
  instruction: string,
  personalizationNotes: string[] = [],
): string {
  const body = fullArticleText(article.blocks);
  const truncated = body.length > ARTICLE_MAX_CHARS;
  return [
    "You are helping a developer read a technical article. Use only the text below. Do not use tools, read files, or browse. Reply in Markdown.",
    "",
    `Article: ${article.title} (${article.url})`,
    "",
    body.slice(0, ARTICLE_MAX_CHARS) +
      (truncated ? "\n\n[article truncated]" : ""),
    "",
    [instruction, ...personalizationNotes].join("\n"),
  ].join("\n");
}

/** Prompt for a question across the developer's saved library. The model
 * may only draw on the passages supplied, and may only cite titles that are
 * in them, so the UI can trust and link every citation it shows. */
export function buildLibraryPrompt(
  question: string,
  passages: RelatedArticle[],
  currentTitle: string | null,
  personalizationNotes: string[] = [],
): string {
  const found =
    passages.length > 0
      ? passages.map((r) => `- "${r.title}": ${r.snippet}`).join("\n")
      : "(No saved article matched this question.)";
  return [
    "You are helping a developer search their own saved reading. Answer using only the passages below, which come from articles they saved. Cite the article title in quotes whenever you use a passage, and never cite a title that is not listed. If the passages do not answer the question, say so plainly instead of guessing. Do not use tools, read files, or browse. Reply in Markdown.",
    "",
    currentTitle
      ? `The developer is currently reading: "${currentTitle}"`
      : null,
    currentTitle ? "" : null,
    "Passages from saved articles:",
    found,
    "",
    [`Question: ${question}`, ...personalizationNotes].join("\n"),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

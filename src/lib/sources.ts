import type { ArticleSummary } from "@/types/library";

// Shorter titles ("Intro", "Rust") would match ordinary words in an answer.
const MIN_TITLE_LENGTH = 6;

/**
 * The saved articles an answer cites, in the order they first appear. A
 * library answer is told to quote titles from the passages it was given; this
 * keeps only titles that really are saved articles, so a made-up citation
 * never becomes a link.
 */
export function citedArticles(
  answer: string,
  articles: Pick<ArticleSummary, "id" | "title">[],
): { id: string; title: string }[] {
  const text = answer.toLowerCase();
  return articles
    .map((a) => ({ a, at: text.indexOf(a.title.trim().toLowerCase()) }))
    .filter(({ a, at }) => at >= 0 && a.title.trim().length >= MIN_TITLE_LENGTH)
    .sort((x, y) => x.at - y.at)
    .map(({ a }) => ({ id: a.id, title: a.title }));
}

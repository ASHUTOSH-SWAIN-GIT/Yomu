import type { StoredArticle } from "@/types/library";

/** True for images that would be fetched from a remote host. Relative and
 * data: URLs never leave the machine, so they're never blocked. */
export function isRemoteImage(src: string): boolean {
  return /^(https?:)?\/\//i.test(src.trim());
}

/** Makes `src` absolute against the article's URL. Articles saved before
 * the scraper resolved image URLs hold relative ones (`/images/a.png`),
 * which would otherwise resolve against the app's own origin and break. */
export function resolveImageUrl(src: string, articleUrl: string): string {
  try {
    return new URL(src, articleUrl).toString();
  } catch {
    return src;
  }
}

/** Unique http(s) image URLs of an article, absolute, in reading order.
 * These are the keys the offline cache is indexed by. */
export function imageUrlsOf(article: StoredArticle): string[] {
  const urls = new Set<string>();
  for (const block of article.blocks) {
    if (block.type !== "image") continue;
    const url = resolveImageUrl(block.src, article.url);
    if (/^https?:/i.test(url)) urls.add(url);
  }
  return [...urls];
}

// An "image highlight" (a question about one picture) is saved as a normal
// highlight whose text is the image as Markdown, so it needs no new column.

/** `![alt](src)`, with brackets in the alt text made harmless. */
export function imageQuote(alt: string | null, src: string): string {
  return `![${(alt ?? "").replace(/[[\]]/g, "")}](${src})`;
}

export function parseImageQuote(
  text: string,
): { alt: string; src: string } | null {
  const match = /^!\[([^\]]*)\]\((\S+)\)$/.exec(text.trim());
  return match ? { alt: match[1], src: match[2] } : null;
}

/** SVGs can be shown and cached but not sent to the agent (vision models
 * read raster images), so the "ask about image" action is hidden for them. */
export function isSvgUrl(src: string): boolean {
  try {
    return new URL(src, "https://x.invalid").pathname
      .toLowerCase()
      .endsWith(".svg");
  } catch {
    return /\.svg(\?|#|$)/i.test(src);
  }
}

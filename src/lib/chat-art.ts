/** How many pictures are in `public/chat-art/` (01.svg, 02.svg, ...). */
export const CHAT_ART_COUNT = 16;

/** The picture shown in a blog's empty chat. It comes from the blog's id, so
 * a blog always gets the same one and different blogs tend to differ. */
export function chatArtFor(articleId: string): string {
  let hash = 0;
  for (const char of articleId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const n = (hash % CHAT_ART_COUNT) + 1;
  return `/chat-art/${String(n).padStart(2, "0")}.svg`;
}

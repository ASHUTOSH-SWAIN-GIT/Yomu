import type { ScrapedArticle } from "@/types/article";
import { upsertArticle } from "@/lib/db";
import { useLibraryStore } from "@/stores/library-store";
import { openSavedArticle } from "@/lib/navigate";

/**
 * A short built-in article that teaches the loop (paste, read, chat),
 * saved as a normal article so every feature works on it, including asking
 * the agent about it. Its canonical URL is not a web address, so it never
 * touches the network and can't collide with a real page.
 */
export const SAMPLE_ARTICLE: ScrapedArticle = {
  url: "https://github.com/ASHUTOSH-SWAIN-GIT/Yomu",
  canonicalUrl: "yomu:sample-article",
  title: "How to read with Yomu",
  author: null,
  site: "Yomu",
  scrapedAt: Date.now(),
  publishedAt: null,
  blocks: [
    {
      type: "paragraph",
      spans: [
        {
          text: "Yomu opens any article as a clean page. Its one idea is that you should never have to leave the page to understand it. This short tour is an ordinary article, so everything below works on it.",
        },
      ],
    },
    { type: "heading", level: 2, text: "Paste a link" },
    {
      type: "paragraph",
      spans: [
        {
          text: "On Home, paste a link into the box and press Enter. Yomu fetches the page, saves it on this computer, and opens it. Every blog you save stays in Home, and images are kept for offline reading. Press ",
        },
        { text: "Cmd+Shift+V", code: true },
        { text: " to open a link you have copied, from anywhere." },
      ],
    },
    { type: "heading", level: 2, text: "Chat about the article" },
    {
      type: "paragraph",
      spans: [
        { text: "Press " },
        { text: "Chat", bold: true },
        {
          text: " in the top bar, or Cmd+J, and a chat opens beside the article. Your local Codex agent has read the article, so ask it anything: what a term means, why a step matters, or for an example. The full screen button gives the chat the whole window.",
        },
      ],
    },
    {
      type: "list",
      ordered: false,
      items: [
        {
          spans: [
            {
              text: "Summarize, Key takeaways and Quiz me are one-tap questions.",
            },
          ],
          depth: 0,
        },
        {
          spans: [{ text: "Each article keeps its own conversation." }],
          depth: 0,
        },
        {
          spans: [
            {
              text: "New chat in the sidebar talks with everything you have saved at once.",
            },
          ],
          depth: 0,
        },
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Collections keep your reading in order",
    },
    {
      type: "paragraph",
      spans: [
        {
          text: "Group blogs into collections, such as Rust or Web, with the folder button on an article or on its card in Home. Create one from New collection in the sidebar. Press ",
        },
        { text: "Cmd+K", code: true },
        {
          text: " to search everything you have read, including your questions and the answers.",
        },
      ],
    },
    {
      type: "quote",
      spans: [
        {
          text: "Reading is not finished when the words run out. It is finished when you understand them.",
        },
      ],
    },
    { type: "heading", level: 2, text: "Make it yours" },
    {
      type: "paragraph",
      spans: [
        { text: "Click any image to zoom in on it. Focus mode (" },
        { text: "Cmd+.", code: true },
        {
          text: ") hides everything except the article, and the moon button in the top bar switches between the light and dark themes.",
        },
      ],
    },
    {
      type: "paragraph",
      spans: [
        {
          text: "That is the whole tour. Go back to Home, paste a link and read something you actually want to understand.",
        },
      ],
    },
  ],
};

/** Saves the sample article (once) and opens it. */
export async function openSampleArticle(): Promise<void> {
  const saved = await upsertArticle({
    ...SAMPLE_ARTICLE,
    scrapedAt: Date.now(),
    publishedAt: null,
  });
  await useLibraryStore.getState().refresh();
  await openSavedArticle(saved.id);
}

import type { ScrapedArticle } from "@/types/article";
import { upsertArticle } from "@/lib/db";
import { useLibraryStore } from "@/stores/library-store";
import { useTabsStore } from "@/stores/tabs-store";

/**
 * A short built-in article that teaches the loop (select, ask, follow up),
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
    { type: "heading", level: 2, text: "Ask about any passage" },
    {
      type: "paragraph",
      spans: [
        {
          text: "Select this sentence with your mouse. A bar appears at the bottom of the window with your selection in it. Press ",
        },
        { text: "Enter", bold: true },
        {
          text: " to have your local Codex agent explain it, or type your own question first, such as ",
        },
        { text: "why does this matter?", italic: true },
        {
          text: ". The answer rises above the bar, and the passage stays marked in the text so you can find it again.",
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
              text: "Simpler, Go deeper and Example are one-click follow-ups.",
            },
          ],
          depth: 0,
        },
        {
          spans: [{ text: "Copy the answer, or regenerate it if it missed." }],
          depth: 0,
        },
        {
          spans: [{ text: "Click a marked passage to see its answer again." }],
          depth: 0,
        },
      ],
    },
    { type: "heading", level: 2, text: "Spaces keep your reading in order" },
    {
      type: "paragraph",
      spans: [
        {
          text: "Group articles into spaces, such as Rust or Web. Each space has its own colour, and the page wears only the colour of the space you are in. Open several articles at once as tabs, and press ",
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
        { text: "The " },
        { text: "Aa", code: true },
        {
          text: " menu changes the typeface, size, width and theme. Focus mode (",
        },
        { text: "Cmd+.", code: true },
        {
          text: ") hides everything except the article. Your articles are saved on this computer, and images are kept for offline reading.",
        },
      ],
    },
    {
      type: "paragraph",
      spans: [
        {
          text: "That is the whole tour. Paste a link in a new tab and read something you actually want to understand.",
        },
      ],
    },
  ],
};

/** Saves the sample article (once) and opens it in a tab. */
export async function openSampleArticle(): Promise<void> {
  const saved = await upsertArticle({
    ...SAMPLE_ARTICLE,
    scrapedAt: Date.now(),
    publishedAt: null,
  });
  await useLibraryStore.getState().refresh();
  await useTabsStore.getState().openArticle(saved.id);
}

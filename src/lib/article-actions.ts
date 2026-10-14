import { openPdfOriginal } from "@/lib/commands";
import { exportArticle } from "@/lib/export-markdown";
import { logError } from "@/lib/log";
import type { Feed } from "@/lib/feeds";
import { isPdfUrl, pdfShaOf } from "@/lib/pdf/identity";
import { useChatStore } from "@/stores/chat-store";
import { useFeedsStore } from "@/stores/feeds-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { toast } from "@/stores/toast-store";
import type { StoredArticle } from "@/types/library";

/** What can be done to the article being read, shared by its "…" menu in
 * the top bar and the command palette. Each one says how it went in a
 * toast. */

type Archivable = { id: string; archived: boolean };

export function isArchived(article: Archivable): boolean {
  return (
    useLibraryStore.getState().articles.find((a) => a.id === article.id)
      ?.archived ?? article.archived
  );
}

export async function refetchArticle(article: StoredArticle) {
  const pdf = isPdfUrl(article.canonicalUrl);
  toast(pdf ? "Reading the PDF again…" : "Fetching the page again…");
  await useReaderStore.getState().rescrape(article);
  // A failure shows on the page itself (the reader's error state).
  if (useReaderStore.getState().state.status === "ready")
    toast(pdf ? "Read again" : "Updated to the latest version");
}

export async function toggleArchived(article: Archivable) {
  const { setArchived } = useLibraryStore.getState();
  const next = !isArchived(article);
  await setArchived(article.id, next);
  toast(next ? "Archived" : "Moved out of the archive", {
    label: "Undo",
    run: () => void setArchived(article.id, !next),
  });
}

/** Subscribes to the blog the article is on: the posts it publishes from now
 * on land in the Inbox. The subscribe dialog shows
 * how it went; closed before the feed was found, a toast does. */
export async function subscribeSite(article: StoredArticle) {
  const { subscribe, setSubscribing } = useFeedsStore.getState();
  const pageUrl = article.url;
  setSubscribing({ status: "looking", pageUrl });
  const stillOpen = () =>
    useFeedsStore.getState().subscribing?.pageUrl === pageUrl;
  try {
    const { feed, existing } = await subscribe(pageUrl);
    if (stillOpen())
      setSubscribing({ status: "done", pageUrl, feed, existing });
    else if (existing) toast(`Already subscribed to ${feed.title}`);
    else toast(`Subscribed to ${feed.title}`);
  } catch (err) {
    logError(`subscribing to the blog of ${pageUrl} failed`, err);
    if (stillOpen()) setSubscribing({ status: "failed", pageUrl });
    else toast("Couldn't find a feed for this site");
  }
}

export async function unsubscribeSite(feed: Feed) {
  const { unsubscribe, subscribe } = useFeedsStore.getState();
  await unsubscribe(feed.id);
  toast(`Unsubscribed from ${feed.title}`, {
    label: "Undo",
    // Subscribing again notes the posts out by now as seen, so Undo does not
    // fill the Inbox with ones published before.
    run: () =>
      void subscribe(feed.feedUrl).catch((e) =>
        logError(`subscribing again to ${feed.title} failed`, e),
      ),
  });
}

export async function exportArticleAsMarkdown(article: StoredArticle) {
  const tags =
    useLibraryStore.getState().articles.find((a) => a.id === article.id)
      ?.tags ?? [];
  try {
    const saved = await exportArticle(
      article,
      tags,
      useChatStore.getState().messages,
    );
    if (saved) toast("Exported as Markdown");
  } catch (err) {
    logError("export failed", err);
    toast("Export failed. The log has the details.");
  }
}

/** The PDF in the computer's PDF viewer. Web pages open through a plain
 * link instead, so the menu shows them as one. */
export function openOriginalPdf(article: StoredArticle) {
  const sha = pdfShaOf(article.canonicalUrl);
  if (sha)
    openPdfOriginal(sha).catch((err) => {
      logError("opening the original PDF failed", err);
      toast("Could not open the PDF.");
    });
}

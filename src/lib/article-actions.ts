import { openPdfOriginal } from "@/lib/commands";
import { exportArticle } from "@/lib/export-markdown";
import { logError } from "@/lib/log";
import { isPdfUrl, pdfShaOf } from "@/lib/pdf/identity";
import { useChatStore } from "@/stores/chat-store";
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

import { importPdf } from "@/lib/commands";
import {
  getArticleByCanonicalUrl,
  saveArticleImages,
  upsertArticle,
} from "@/lib/db";
import { saveToDefaultCollection } from "@/lib/default-collection";
import { logError } from "@/lib/log";
import { fileUrl, pdfCanonicalUrl } from "@/lib/pdf/identity";
import { readSavedPdf, type PdfProgress } from "@/lib/pdf/import";
import { useLibraryStore } from "@/stores/library-store";
import type { StoredArticle } from "@/types/library";

/** Adds a PDF from this computer to the library: keeps a copy, reads it
 * into an article and saves it. The same file added before is not read
 * again; its saved copy (with its comments and chat) comes back instead. */
export async function addPaper(
  path: string,
  onProgress: (p: PdfProgress) => void = () => {},
): Promise<{ article: StoredArticle; added: boolean }> {
  const copy = await importPdf(path);
  const cached = await getArticleByCanonicalUrl(pdfCanonicalUrl(copy.sha));
  if (cached) return { article: cached, added: false };

  const scraped = await readSavedPdf(
    copy.sha,
    copy.fileName,
    fileUrl(path),
    onProgress,
  );
  const saved = await upsertArticle(scraped);
  await saveArticleImages(saved.id, scraped.figures);
  // A failure to file it must not lose the paper that was just saved.
  await saveToDefaultCollection(saved.id).catch((err) =>
    logError("saving to the default collection failed", err),
  );
  await useLibraryStore.getState().refresh();
  return { article: saved, added: true };
}

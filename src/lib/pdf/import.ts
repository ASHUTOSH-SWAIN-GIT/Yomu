import { readPdfBytes } from "@/lib/commands";
import {
  baseName,
  isPdfUrl,
  pdfCanonicalUrl,
  pdfShaOf,
} from "@/lib/pdf/identity";
import { loadPdfjs, readPdf } from "@/lib/pdf/load";
import { parsePages } from "@/lib/pdf/parse";
import type { ScrapedArticle } from "@/types/article";

export interface PdfProgress {
  page: number;
  pages: number;
}

export async function readSavedPdf(
  sha: string,
  fileName: string,
  url: string,
  onProgress: (p: PdfProgress) => void,
  signal?: AbortSignal,
): Promise<ScrapedArticle> {
  const bytes = await readPdfBytes(sha);
  const pdfjs = await loadPdfjs();
  const { pages, info } = await readPdf(
    pdfjs,
    bytes,
    (page, total) => onProgress({ page, pages: total }),
    signal,
  );
  const parsed = parsePages(pages, info, fileName);
  return {
    url,
    canonicalUrl: pdfCanonicalUrl(sha),
    title: parsed.title,
    author: parsed.author,
    site: "PDF",
    blocks: parsed.blocks,
    scrapedAt: Date.now(),
    publishedAt: parsed.publishedAt,
    icon: null,
  };
}

/** Reads a saved paper again from Yomu's own copy (the parser may have
 * improved since). */
export async function reimportPdf(
  article: { url: string; canonicalUrl: string },
  onProgress: (p: PdfProgress) => void = () => {},
): Promise<ScrapedArticle> {
  const sha = pdfShaOf(article.canonicalUrl);
  if (!sha || !isPdfUrl(article.canonicalUrl)) {
    throw new Error("This is not an imported PDF.");
  }
  return readSavedPdf(sha, baseName(article.url), article.url, onProgress);
}

import { readPdfBytes, savePdfFigure } from "@/lib/commands";
import { logError } from "@/lib/log";
import {
  baseName,
  isPdfUrl,
  pdfCanonicalUrl,
  pdfShaOf,
} from "@/lib/pdf/identity";
import { loadPdfjs, readPdf } from "@/lib/pdf/load";
import { figureSrc, parsePages } from "@/lib/pdf/parse";
import { renderRegions } from "@/lib/pdf/render";
import type { ScrapedArticle } from "@/types/article";

export interface PdfProgress {
  page: number;
  pages: number;
  /** Reading the text, or drawing the figures (after the text). */
  stage?: "text" | "figures";
}

/** A paper read from its PDF, with its figures saved as pictures: the
 * caller records them for the article once it has an id
 * (`saveArticleImages`). */
export type PdfArticle = ScrapedArticle & {
  figures: { url: string; file: string }[];
};

export async function readSavedPdf(
  sha: string,
  fileName: string,
  url: string,
  onProgress: (p: PdfProgress) => void,
  signal?: AbortSignal,
): Promise<PdfArticle> {
  const bytes = await readPdfBytes(sha);
  const pdfjs = await loadPdfjs();
  const { pages, info } = await readPdf(
    pdfjs,
    // pdf.js takes the bytes it is given (they move to its worker), and
    // the figures are drawn from the file afterwards: give it a copy.
    bytes.slice(),
    (page, total) => onProgress({ page, pages: total, stage: "text" }),
    signal,
  );
  const parsed = parsePages(pages, info, fileName, sha);

  // Figures, tables and equations as pictures. Without them the paper
  // still reads (the picture shows as missing), so a failure is logged and
  // not fatal.
  const figures: PdfArticle["figures"] = [];
  try {
    const pngs = await renderRegions(
      pdfjs,
      bytes,
      parsed.regions,
      (page, total) => onProgress({ page, pages: total, stage: "figures" }),
    );
    for (const region of parsed.regions) {
      const png = pngs.get(region.id);
      if (!png) continue;
      const url = figureSrc(sha, region);
      figures.push({ url, file: await savePdfFigure(url, png) });
    }
  } catch (err) {
    logError("drawing the figures of a PDF failed", err);
  }

  return {
    figures,
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
): Promise<PdfArticle> {
  const sha = pdfShaOf(article.canonicalUrl);
  if (!sha || !isPdfUrl(article.canonicalUrl)) {
    throw new Error("This is not an imported PDF.");
  }
  return readSavedPdf(sha, baseName(article.url), article.url, onProgress);
}

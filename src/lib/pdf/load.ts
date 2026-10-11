import type { PdfInfo, PdfPage, PdfText } from "@/lib/pdf/types";

/** "D:20170612143000+02'00'" to ms; null when it is not a date. */
export function parsePdfDate(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(raw);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00"] = m;
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isFinite(t) ? t : null;
}

/** The pdf.js parts used here (the full types are large; this is all that
 * is touched, so the library can be loaded when needed). */
interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
}
interface PdfjsPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{
    items: {
      str?: string;
      transform?: number[];
      width?: number;
      fontName?: string;
    }[];
  }>;
  getOperatorList(): Promise<unknown>;
  commonObjs: { has(id: string): boolean; get(id: string): { name?: string } };
  cleanup(): void;
}
export interface PdfjsLib {
  getDocument(src: { data: Uint8Array } & Record<string, unknown>): {
    promise: Promise<PdfjsDocument>;
    destroy(): Promise<void>;
  };
}

/** Safari's engine (what the app's window is) cannot loop over a
 * ReadableStream with `for await`, which pdf.js does when it reads a file.
 * This adds the missing iterator. */
export function polyfillStreamIteration() {
  const proto = ReadableStream.prototype as unknown as Record<
    symbol | string,
    unknown
  >;
  if (typeof proto[Symbol.asyncIterator] === "function") return;
  async function* iterate(this: ReadableStream<unknown>) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  proto[Symbol.asyncIterator] = iterate;
  proto.values ??= iterate;
}

/** Loads pdf.js in the app (the build for older engines, and a worker file
 * the bundler provides). */
export async function loadPdfjs(): Promise<PdfjsLib> {
  polyfillStreamIteration();
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: worker } =
    await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib as unknown as PdfjsLib;
}

/** Reads every page's text, with position, size and font. `onPage` is told
 * how far it has got. */
export async function readPdf(
  pdfjs: PdfjsLib,
  bytes: Uint8Array,
  onPage: (page: number, pages: number) => void = () => {},
  signal?: AbortSignal,
): Promise<{ pages: PdfPage[]; info: PdfInfo }> {
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => ({ info: undefined }));
    const info: PdfInfo = {
      title: typeof meta.info?.Title === "string" ? meta.info.Title : null,
      author: typeof meta.info?.Author === "string" ? meta.info.Author : null,
      created: parsePdfDate(meta.info?.CreationDate),
    };

    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Loads the page's fonts, so their real names can be read.
      await page.getOperatorList().catch(() => null);

      const names = new Map<string, string>();
      const nameOf = (id: string) => {
        if (!names.has(id)) {
          let name = "";
          try {
            if (page.commonObjs.has(id))
              name = page.commonObjs.get(id).name ?? "";
          } catch {
            // Not loaded: no style information for this font.
          }
          names.set(id, name);
        }
        return names.get(id)!;
      };

      const items: PdfText[] = [];
      for (const item of content.items) {
        if (typeof item.str !== "string" || !item.transform) continue;
        const [a, b, , , e, f] = item.transform;
        items.push({
          str: item.str,
          x: e,
          y: view.height - f,
          width: item.width ?? 0,
          size: Math.hypot(a, b) || 10,
          font: item.fontName ? nameOf(item.fontName) : "",
        });
      }
      pages.push({ number: n, width: view.width, height: view.height, items });
      page.cleanup();
      onPage(n, doc.numPages);
    }
    return { pages, info };
  } finally {
    void task.destroy();
  }
}

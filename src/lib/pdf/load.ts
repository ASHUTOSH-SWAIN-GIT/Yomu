import { graphicsOf, type DrawOps } from "@/lib/pdf/graphics";
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
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getAnnotations(): Promise<
    { subtype?: string; url?: string; rect?: number[] }[]
  >;
  commonObjs: { has(id: string): boolean; get(id: string): { name?: string } };
  cleanup(): void;
}
export interface PdfjsLib {
  OPS: DrawOps;
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
      // Loads the page's fonts, so their real names can be read, and says
      // where pictures and drawings are.
      const ops = await page.getOperatorList().catch(() => null);
      const graphics = ops ? graphicsOf(ops, pdfjs.OPS, view.height) : [];
      const links = await webLinks(page, view.height);

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
        const text: PdfText = {
          str: item.str,
          x: e,
          y: view.height - f,
          width: item.width ?? 0,
          size: Math.hypot(a, b) || 10,
          font: item.fontName ? nameOf(item.fontName) : "",
        };
        const href = linkAt(links, text);
        if (href) text.href = href;
        items.push(text);
      }
      pages.push({
        number: n,
        width: view.width,
        height: view.height,
        items,
        graphics,
      });
      page.cleanup();
      onPage(n, doc.numPages);
    }
    return { pages, info };
  } finally {
    void task.destroy();
  }
}

interface WebLink {
  url: string;
  x: number;
  x2: number;
  /** Top and bottom, measured from the top of the page. */
  y: number;
  y2: number;
}

/** The page's links to web addresses (links within the PDF, such as a
 * citation jumping to its reference, are left out). */
async function webLinks(page: PdfjsPage, height: number): Promise<WebLink[]> {
  const annotations = await page.getAnnotations().catch(() => []);
  return annotations.flatMap((a) =>
    a.subtype === "Link" &&
    typeof a.url === "string" &&
    /^https?:\/\//i.test(a.url) &&
    a.rect?.length === 4
      ? [
          {
            url: a.url,
            x: Math.min(a.rect[0], a.rect[2]),
            x2: Math.max(a.rect[0], a.rect[2]),
            y: height - Math.max(a.rect[1], a.rect[3]),
            y2: height - Math.min(a.rect[1], a.rect[3]),
          },
        ]
      : [],
  );
}

/** The link a piece of text sits under: its baseline inside the link's
 * box, and most of its width too. */
export function linkAt(links: WebLink[], t: PdfText): string | undefined {
  if (t.str.trim() === "") return undefined;
  const width = Math.max(t.width, 1);
  return links.find((l) => {
    const overlap = Math.min(l.x2, t.x + width) - Math.max(l.x, t.x);
    return (
      t.y >= l.y - 1 && t.y <= l.y2 + t.size * 0.3 && overlap >= width * 0.5
    );
  })?.url;
}

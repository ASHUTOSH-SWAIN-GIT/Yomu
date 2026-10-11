import type { PdfjsLib } from "@/lib/pdf/load";
import type { Region } from "@/lib/pdf/regions";

/** Pixels per PDF point in the cut-out pictures: sharp on a high density
 * screen at the size they are shown (about 1.7 times the page). */
const SCALE = 3;
/** Canvas sides beyond this are refused by some webviews. */
const MAX_SIDE = 8000;

/** The parts of pdf.js drawing needs (see load.ts for the rest). */
interface Drawable {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    background?: string;
  }): { promise: Promise<void> };
  cleanup(): void;
}

/** Draws the pages that have regions and cuts each region out as a PNG.
 * Pages are drawn one at a time, white behind them (as on paper). A region
 * that cannot be drawn is left out; the text around it is unaffected. */
export async function renderRegions(
  pdfjs: PdfjsLib,
  bytes: Uint8Array,
  regions: Region[],
  onPage: (done: number, pages: number) => void = () => {},
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (regions.length === 0) return out;
  const byPage = new Map<number, Region[]>();
  for (const r of regions) {
    byPage.set(r.page, [...(byPage.get(r.page) ?? []), r]);
  }

  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    let done = 0;
    for (const [number, on] of byPage) {
      const page = (await doc.getPage(number)) as unknown as Drawable;
      const viewport = page.getViewport({ scale: SCALE }) as {
        width: number;
        height: number;
      };
      if (viewport.width > MAX_SIDE || viewport.height > MAX_SIDE) continue;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      try {
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          background: "#ffffff",
        }).promise;
        for (const region of on) {
          const png = await cut(canvas, region);
          if (png) out.set(region.id, png);
        }
      } catch {
        // A page that will not draw keeps its figures as missing pictures.
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
      onPage(++done, byPage.size);
    }
    return out;
  } finally {
    void task.destroy();
  }
}

async function cut(
  page: HTMLCanvasElement,
  r: Region,
): Promise<Uint8Array | null> {
  const x = Math.max(0, Math.floor(r.x * SCALE));
  const y = Math.max(0, Math.floor(r.y * SCALE));
  const w = Math.min(page.width, Math.ceil(r.x2 * SCALE)) - x;
  const h = Math.min(page.height, Math.ceil(r.y2 * SCALE)) - y;
  if (w < 4 || h < 4) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(page, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  canvas.width = 0;
  canvas.height = 0;
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** One piece of text as pdf.js reports it. `y` is the baseline measured from
 * the top of the page (pdf.js counts from the bottom). */
export interface PdfText {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
  /** The font's own name (`ABCDEF+CMBX10`), when known. */
  font: string;
}

export interface PdfPage {
  number: number;
  width: number;
  height: number;
  items: PdfText[];
}

/** What the PDF says about itself. */
export interface PdfInfo {
  title?: string | null;
  author?: string | null;
  /** When it was created, in ms. */
  created?: number | null;
}

/** Thrown when there is nothing to read (a scan, or only pictures). */
export class NoTextError extends Error {
  constructor() {
    super(
      "This PDF has no selectable text (it is probably a scan). Yomu can't read scanned pages yet.",
    );
    this.name = "NoTextError";
  }
}

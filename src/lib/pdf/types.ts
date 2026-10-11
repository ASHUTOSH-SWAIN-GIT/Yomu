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
  /** A web link the text sits under (a PDF link annotation). */
  href?: string;
}

/** A rectangle on a page, measured from the top like the text. `image` is
 * true for a picture, false for drawn lines and shapes. */
export interface Box {
  x: number;
  y: number;
  x2: number;
  y2: number;
  image: boolean;
}

export interface PdfPage {
  number: number;
  width: number;
  height: number;
  items: PdfText[];
  /** Where pictures and drawings are (see graphics.ts). */
  graphics?: Box[];
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

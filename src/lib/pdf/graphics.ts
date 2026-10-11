import type { Box } from "@/lib/pdf/types";

/** The drawing operators this file reads, by name (pdf.js numbers them;
 * the numbers come from the loaded library's `OPS`). */
export interface DrawOps {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` then `n`, the way PDF matrices combine. */
function multiply(m: Matrix, n: number[]): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** The box around a rectangle once `m` has moved it, measured from the top
 * of the page like the text is. */
function boxOf(
  m: Matrix,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pageHeight: number,
  image: boolean,
): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(pageHeight - (m[1] * x + m[3] * y + m[5]));
  }
  const box = {
    x: Math.min(...xs),
    x2: Math.max(...xs),
    y: Math.min(...ys),
    y2: Math.max(...ys),
    image,
  };
  return [box.x, box.x2, box.y, box.y2].every(Number.isFinite) ? box : null;
}

const isNumbers = (v: unknown, n: number): v is ArrayLike<number> =>
  !!v &&
  typeof v === "object" &&
  (v as ArrayLike<number>).length === n &&
  typeof (v as ArrayLike<number>)[0] === "number";

/** Where a page draws pictures and lines: one box per image and per path,
 * from its operator list. Figures are found where these sit next to a
 * caption (see regions.ts). */
export function graphicsOf(
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: DrawOps,
  pageHeight: number,
): Box[] {
  const boxes: Box[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === OPS.transform && isNumbers(args, 6)) {
      ctm = multiply(ctm, Array.from(args as ArrayLike<number>));
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = args?.[0];
      if (isNumbers(matrix, 6)) ctm = multiply(ctm, Array.from(matrix));
    } else if (fn === OPS.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject
    ) {
      // An image fills the unit square of the current matrix.
      const box = boxOf(ctm, 0, 0, 1, 1, pageHeight, true);
      if (box) boxes.push(box);
    } else if (fn === OPS.constructPath) {
      // The path's own bounds, before the current matrix.
      const minMax = args?.[2];
      if (isNumbers(minMax, 4)) {
        const [x0, y0, x1, y1] = Array.from(minMax);
        const box = boxOf(ctm, x0, y0, x1, y1, pageHeight, false);
        if (box) boxes.push(box);
      }
    }
  });
  return boxes;
}

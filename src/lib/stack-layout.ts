export interface Box {
  /** Distance from the top of the page, in pixels. */
  top: number;
  height: number;
}

/** The distance each box must move down so that none runs into the one
 * before it, keeping their order, with `gap` between them. A box with room
 * stays where it is (shift 0). Boxes are given top to bottom. */
export function stackShifts(boxes: Box[], gap: number): number[] {
  let bottom = Number.NEGATIVE_INFINITY;
  return boxes.map((box) => {
    const top = Math.max(box.top, bottom + gap);
    bottom = top + box.height;
    return top - box.top;
  });
}

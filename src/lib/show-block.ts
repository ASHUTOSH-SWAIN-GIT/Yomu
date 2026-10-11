/** Asks the reader to bring a block into view. A paged reader (papers)
 * turns to the page that holds it; a scrolling one has it already. */
export const SHOW_BLOCK = "yomu-show-block";

export function requestBlock(index: number) {
  window.dispatchEvent(new CustomEvent<number>(SHOW_BLOCK, { detail: index }));
}

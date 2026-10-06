/** Room needed to the right of the article box for a comment: its width
 * (16rem) and a little air. The comment starts where the box ends, since the
 * gap to the text is the box's own padding. */
export const COMMENT_ROOM = 272;
/** The least the article keeps on its left when it moves aside for them. */
const MIN_LEFT = 16;

export interface CommentLayout {
  /** Comments sit in the margin beside their paragraph (else under it). */
  beside: boolean;
  /** The article's new left margin when it slides over; null keeps it centred. */
  left: number | null;
}

/** Where comments go, given the space `room` left beside the article box:
 * in the margin with the article still centred, in the margin with the
 * article moved left, or (too narrow even then) under their paragraph. */
export function commentLayout(room: number): CommentLayout {
  if (room >= 2 * COMMENT_ROOM) return { beside: true, left: null };
  if (room >= COMMENT_ROOM + MIN_LEFT)
    return { beside: true, left: Math.round(room - COMMENT_ROOM) };
  return { beside: false, left: null };
}

/** The heading the reader is at: the last one whose top has reached
 * `limit`. `tops` are the headings' tops in reading order (null where a
 * heading is not on the page); with none reached it is the first. */
export function currentHeadingIndex(
  tops: (number | null)[],
  limit: number,
): number {
  let found = 0;
  tops.forEach((top, i) => {
    if (top !== null && top <= limit) found = i;
  });
  return found;
}

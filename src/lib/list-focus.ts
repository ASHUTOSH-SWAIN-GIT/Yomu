import type { KeyboardEvent } from "react";

/** Arrow keys (or j/k) move between the rows (`[data-row]`) of a list. In a
 * text box inside the list (its search) letters are typing, so only the
 * down arrow moves, into the list. */
export function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const typing = (e.target as HTMLElement).closest?.("input, textarea");
  const step =
    e.key === "ArrowDown" ||
    (!typing && (e.key === "j" || e.key === "ArrowRight"))
      ? 1
      : !typing &&
          (e.key === "ArrowUp" || e.key === "k" || e.key === "ArrowLeft")
        ? -1
        : 0;
  if (!step) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")];
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[Math.min(Math.max(i + step, 0), rows.length - 1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

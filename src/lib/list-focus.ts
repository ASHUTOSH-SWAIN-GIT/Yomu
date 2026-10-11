import type { KeyboardEvent } from "react";

/** Arrow keys (or j/k) move between the rows (`[data-row]`) of a list. */
export function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const step =
    e.key === "ArrowDown" || e.key === "j" || e.key === "ArrowRight"
      ? 1
      : e.key === "ArrowUp" || e.key === "k" || e.key === "ArrowLeft"
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

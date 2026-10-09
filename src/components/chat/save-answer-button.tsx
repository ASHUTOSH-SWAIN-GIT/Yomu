import { MessageSquareText } from "lucide-react";

/** Keeps an answer about some words as a comment beside them; shows on hover
 * of its `group` row, next to the copy button. */
export function SaveAnswerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Save as a comment"
      title="Save as a comment on those words"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 mt-1 grid size-7 place-items-center rounded-md opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
    >
      <MessageSquareText className="size-3.5" aria-hidden />
    </button>
  );
}

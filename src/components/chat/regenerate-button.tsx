import { RefreshCw } from "lucide-react";

/** Asks for a fresh answer to the last question; shows on hover of its
 * `group` row, next to the copy button. */
export function RegenerateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Answer again"
      title="Answer again"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 mt-1 grid size-7 place-items-center rounded-md opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
    >
      <RefreshCw className="size-3.5" aria-hidden />
    </button>
  );
}

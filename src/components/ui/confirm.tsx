import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Delete this?" in place of the thing itself, with Delete and Keep.
 * `stacked` puts the buttons under the question, for narrow places like the
 * sidebar. */
export function Confirm({
  question,
  note,
  keepLabel = "Keep",
  stacked,
  onConfirm,
  className,
}: {
  question: string;
  /** A short reassurance shown with the question. */
  note?: string;
  keepLabel?: string;
  stacked?: boolean;
  onConfirm: (yes: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-ui flex",
        stacked ? "text-meta flex-col gap-2" : "items-center gap-3",
        className,
      )}
    >
      <span className="line-clamp-2 min-w-0">
        {question}
        {note && <span className="text-muted-foreground"> {note}</span>}
      </span>
      <span className={cn("flex shrink-0 gap-1.5", !stacked && "ml-auto")}>
        <Button
          size="sm"
          variant="destructive"
          className="text-meta h-7 px-2.5"
          onClick={() => onConfirm(true)}
        >
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          // The safe answer takes the keyboard.
          autoFocus
          className="text-meta h-7 px-2.5"
          onClick={() => onConfirm(false)}
        >
          {keepLabel}
        </Button>
      </span>
    </div>
  );
}

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** The pieces of the theme and typeface dropdowns: a small heading, and a
 * choice with a check on the one in use. */
export function Group({ title }: { title: string }) {
  return (
    <div className="text-muted-foreground text-caption mt-1.5 px-2.5 pt-1 pb-0.5 font-semibold tracking-wide uppercase">
      {title}
    </div>
  );
}

export function Option({
  on,
  label,
  note,
  swatch,
  onClick,
}: {
  on: boolean;
  label: string;
  note?: string;
  swatch?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring/60 text-ui flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none focus-visible:ring-2",
        on && "bg-accent/60",
      )}
    >
      {swatch}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {note && (
          <span className="text-muted-foreground text-meta ml-1.5">{note}</span>
        )}
      </span>
      <Check
        className={cn("size-3.5 shrink-0", !on && "invisible")}
        aria-hidden
      />
    </button>
  );
}

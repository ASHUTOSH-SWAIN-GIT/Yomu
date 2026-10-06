import { cn } from "@/lib/utils";

/** A titled block of the customize page. */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 pt-10 first:pt-0">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {note && (
        <p className="text-muted-foreground mt-1 text-[0.8125rem]">{note}</p>
      )}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** One setting: its name and what it does on the left, its control on the
 * right. */
export function Setting({
  label,
  hint,
  children,
  stacked,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  /** The control goes under the text, for wide ones. */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-x-6 gap-y-2",
        stacked ? "flex-col" : "items-center justify-between",
      )}
    >
      <div className="min-w-0">
        <div className="text-[0.875rem] font-medium">{label}</div>
        {hint && (
          <div className="text-muted-foreground mt-0.5 text-[0.75rem] leading-snug">
            {hint}
          </div>
        )}
      </div>
      <div className={cn(!stacked && "shrink-0")}>{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-visible:ring-ring/60 relative h-6 w-10 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2",
        checked ? "bg-primary" : "bg-secondary",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "bg-background absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform",
          checked && "translate-x-4",
          checked && "bg-primary-foreground",
        )}
      />
    </button>
  );
}

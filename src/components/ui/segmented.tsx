import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Spoken name when the visible label is just a glyph. */
  ariaLabel?: string;
}

/**
 * A single-choice control drawn as connected segments. It is a radio group
 * for assistive tech: one tab stop, arrow keys move the choice.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  function move(from: number, step: number, target: HTMLElement) {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    // Focus follows the choice (the newly checked radio owns the tab stop).
    const radios =
      target.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
    requestAnimationFrame(() => radios?.[next]?.focus());
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "border-input inline-flex rounded-md border p-0.5",
        className,
      )}
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1, e.currentTarget);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1, e.currentTarget);
              }
            }}
            className={cn(
              "focus-visible:ring-ring/60 min-w-8 rounded-[5px] px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2",
              checked
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

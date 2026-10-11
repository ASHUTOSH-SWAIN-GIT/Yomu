import { cn } from "@/lib/utils";

/** Something went wrong: the message, and the one thing to do about it. */
export function Alert({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "bg-destructive/8 text-destructive text-ui flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_30%,transparent)]",
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="focus-visible:ring-ring/60 shrink-0 rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

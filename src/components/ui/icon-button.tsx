import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-6 [&_svg]:size-3.5",
  md: "size-7 [&_svg]:size-3.5",
  lg: "size-8 [&_svg]:size-4",
};

/** A square button with only an icon. `label` is both its spoken name and
 * its tooltip, so no icon button is left unnamed. */
export function IconButton({
  label,
  size = "lg",
  danger,
  active,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label"> & {
  label: string;
  size?: keyof typeof SIZES;
  /** Turns red on hover, for delete. */
  danger?: boolean;
  /** Pressed or open: shown on the accent surface. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "focus-visible:ring-ring/60 grid shrink-0 place-items-center rounded-md transition-colors duration-[var(--dur-fast)] outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
        SIZES[size],
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/70",
        danger ? "hover:text-destructive" : "hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** The Yomu mark and name. 読 (yomu, "to read") in a rounded square, with the
 * name set in the display serif. A placeholder until the icon pass (see
 * docs/design-plan.md, identity). */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        aria-hidden
        className="bg-foreground text-background relative grid size-7 place-items-center rounded-[9px] text-[0.875rem] font-bold"
      >
        読
        {/* The annotation underline, in the current space's colour: the app
            icon's mark, alive. */}
        <span className="bg-space absolute bottom-[3px] h-[2px] w-3.5 rounded-full" />
      </div>
      <span className="font-display text-[1.25rem] leading-none font-semibold tracking-[-0.02em]">
        Yomu
      </span>
    </div>
  );
}

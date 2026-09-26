/** The Yomu mark and name. 読 (yomu, "to read") in a rounded square, with the
 * name set in the display serif. A placeholder until the icon pass (see
 * docs/design-plan.md, identity). */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        aria-hidden
        className="bg-foreground text-background relative grid size-6 place-items-center rounded-[6px] text-[0.75rem] font-bold"
      >
        読
        <span className="bg-background absolute bottom-[3px] h-px w-3" />
      </div>
      <span className="text-[0.875rem] leading-none font-semibold tracking-[-0.01em]">
        Yomu
      </span>
    </div>
  );
}

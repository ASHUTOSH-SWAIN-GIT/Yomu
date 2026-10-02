import { cn } from "@/lib/utils";

function initial(site: string): string {
  return (site.replace(/^(www|docs?|blog)\./, "")[0] ?? "·").toUpperCase();
}

/** A small generated cover: a tinted page with the site's initial set large,
 * so the library is scannable without fetching any images. */
export function ArticleCover({
  site,
  color,
  progress,
  className,
}: {
  site: string;
  color: string;
  progress?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden", className)}
      style={{
        background: `linear-gradient(140deg, color-mix(in oklab, ${color} 24%, var(--card)), color-mix(in oklab, ${color} 8%, var(--card)) 70%)`,
      }}
    >
      <span
        className="font-display absolute right-3 -bottom-[0.2em] text-[5rem] leading-none font-semibold select-none"
        style={{ color: `color-mix(in oklab, ${color} 38%, transparent)` }}
      >
        {initial(site)}
      </span>
      {/* Three ruled lines: an abstract page of text. */}
      <span className="absolute top-4 left-4 flex w-1/2 flex-col gap-1.5">
        {[100, 82, 64].map((w) => (
          <i
            key={w}
            className="block h-[3px] rounded-full"
            style={{
              width: `${w}%`,
              background: `color-mix(in oklab, ${color} 30%, transparent)`,
            }}
          />
        ))}
      </span>
      {progress !== undefined && progress > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/5">
          <span
            className="block h-full"
            style={{ width: `${progress * 100}%`, background: color }}
          />
        </span>
      )}
    </div>
  );
}

/** The site's initial in a small tinted square, for list rows. */
export function SiteMark({ site, color }: { site: string; color: string }) {
  return (
    <span
      aria-hidden
      className="font-display grid size-7 shrink-0 place-items-center rounded-md text-[0.8125rem] font-semibold"
      style={{
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 22%, transparent)`,
      }}
    >
      {initial(site)}
    </span>
  );
}

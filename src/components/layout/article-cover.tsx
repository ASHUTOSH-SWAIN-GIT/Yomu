import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

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

/** The site's logo address to show, trying the icon the page declared, then
 * its touch icon, then its favicon. Fetched from the site itself (already
 * contacted to save the blog), never a third party, and none when remote
 * images are blocked. `next` moves to the following candidate after a
 * failed load; `src` is `undefined` once none is left. */
function useSiteLogo(url: string, icon?: string | null) {
  const blocked = useUiStore((s) => s.blockRemoteImages);
  const [tried, setTried] = useState(0);
  const sources: string[] = icon ? [icon] : [];
  try {
    const page = new URL(url);
    if (/^https?:$/.test(page.protocol)) {
      sources.push(
        new URL("/apple-touch-icon.png", page).href,
        new URL("/favicon.ico", page).href,
      );
    }
  } catch {
    // Not a web address (the built-in tour): use the initial.
  }
  return {
    src: blocked ? undefined : sources[tried],
    next: () => setTried((n) => n + 1),
  };
}

/** The site's logo in a small tile, for list rows. */
export function SiteLogoTile({
  url,
  icon,
  site,
  className,
}: {
  url: string;
  icon?: string | null;
  site: string;
  className?: string;
}) {
  const { src, next } = useSiteLogo(url, icon);
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center", className)}>
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          onError={next}
          className="size-8 rounded-md object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="text-muted-foreground text-lg font-semibold"
        >
          {initial(site)}
        </span>
      )}
    </span>
  );
}

/** The top of a blog card: the site's logo large in the middle, over a soft
 * wash made from the logo itself, so the logo fills the space. Falls back
 * to the site's initial on a tint of its colour. */
export function SiteLogoBanner({
  url,
  icon,
  site,
  color,
  className,
  children,
}: {
  url: string;
  icon?: string | null;
  site: string;
  color: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { src, next } = useSiteLogo(url, icon);

  return (
    <span
      className={cn(
        "relative grid place-items-center overflow-hidden",
        className,
      )}
      style={{
        background: `linear-gradient(140deg, color-mix(in oklab, ${color} 22%, var(--card)), color-mix(in oklab, ${color} 8%, var(--card)))`,
      }}
    >
      {src && (
        // The same logo, enlarged and blurred, as the backdrop.
        <img
          src={src}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-[2.5] object-cover opacity-90 blur-2xl brightness-50"
        />
      )}
      <span className="bg-background relative grid size-16 place-items-center overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
        {src ? (
          <img
            src={src}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            onError={next}
            className="size-12 object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="text-muted-foreground text-2xl font-semibold"
          >
            {initial(site)}
          </span>
        )}
      </span>
      {children}
    </span>
  );
}

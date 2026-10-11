import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { blockText } from "@/lib/article-text";
import type { Pager } from "@/hooks/use-paper-pager";
import { cn } from "@/lib/utils";
import type { StoredArticle } from "@/types/library";

/** What sits on top of a page after the first: where you are in the paper. */
export function PageHead({ pager, title }: { pager: Pager; title: string }) {
  return (
    <div className="text-muted-foreground text-meta mb-[2em] flex items-center gap-3 font-sans">
      <span className="text-foreground font-medium tabular-nums">
        Page {pager.index + 1} of {pager.pages.length}
      </span>
      <span className="truncate">{title}</span>
    </div>
  );
}

/** The end of a page: the way on, with a glimpse of what comes next. */
export function PageEnd({
  pager,
  article,
}: {
  pager: Pager;
  article: StoredArticle;
}) {
  const next = pager.pages[pager.index + 1];
  if (!next) {
    return (
      <div className="text-muted-foreground text-ui mt-[3em] border-t pt-6 text-center font-sans">
        End of the paper
      </div>
    );
  }
  const blocks = article.blocks.slice(next.start, next.end);
  const heading = blocks.find((b) => b.type === "heading");
  const preview =
    heading && heading.type === "heading"
      ? heading.text
      : blockText(blocks[0] ?? { type: "paragraph", spans: [] }).slice(0, 110);
  return (
    <button
      type="button"
      onClick={() => pager.go(pager.index + 1)}
      className="hover:bg-muted/60 focus-visible:ring-ring/60 border-border group mt-[3em] flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left font-sans transition-colors outline-none focus-visible:ring-2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-muted-foreground text-meta">
          Next · page {pager.index + 2} of {pager.pages.length}
        </span>
        <span className="text-prose truncate font-medium">
          {preview || "Continue"}
        </span>
      </span>
      <ChevronRight
        className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}

/** The page turner that stays at the bottom of the window. */
export function PageBar({ pager }: { pager: Pager }) {
  const count = pager.pages.length;
  const [draft, setDraft] = useState<string | null>(null);
  const button =
    "text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 grid size-8 place-items-center rounded-full outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35";
  return (
    <nav
      aria-label="Pages"
      className="bg-popover/90 text-ui sticky bottom-5 z-10 mx-auto mt-auto flex w-fit items-center gap-1 rounded-full px-1.5 py-1 font-sans shadow-[var(--shadow-float)] backdrop-blur"
    >
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page (←)"
        disabled={pager.index === 0}
        onClick={() => pager.go(pager.index - 1)}
        className={button}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="text-muted-foreground flex items-center gap-1.5 px-1 tabular-nums">
        Page
        <input
          aria-label="Page number"
          inputMode="numeric"
          value={draft ?? String(pager.index + 1)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = Number(draft);
              if (n >= 1) pager.go(n - 1);
              setDraft(null);
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          style={{ width: `${String(count).length + 1}ch` }}
          className="text-foreground bg-muted rounded-md py-0.5 text-center font-medium outline-none"
        />
        of {count}
      </span>
      <button
        type="button"
        aria-label="Next page"
        title="Next page (→)"
        disabled={pager.index >= count - 1}
        onClick={() => pager.go(pager.index + 1)}
        className={button}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span
        aria-hidden
        className="bg-muted mx-1.5 h-1 w-16 overflow-hidden rounded-full"
      >
        <span
          className={cn(
            "bg-foreground/70 block h-full rounded-full transition-[width] duration-300",
          )}
          style={{ width: `${((pager.index + 1) / count) * 100}%` }}
        />
      </span>
    </nav>
  );
}

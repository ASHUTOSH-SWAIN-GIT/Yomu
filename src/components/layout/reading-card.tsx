import { SiteLogoTile } from "@/components/layout/article-cover";
import { openSavedArticle } from "@/lib/navigate";
import { finished, started } from "@/lib/reading";
import { cn } from "@/lib/utils";
import type { ArticleSummary } from "@/types/library";

/** Where you are in something, for the right end of a list row: a small
 * bar and the percentage, "Finished" or "Not started". Hidden while the
 * row's actions show in its place. */
export function ReadState({ article }: { article: ArticleSummary }) {
  return (
    <span className="text-muted-foreground text-meta flex w-24 shrink-0 items-center justify-end gap-2 tabular-nums group-focus-within:invisible group-hover:invisible">
      {finished(article) ? (
        "Finished"
      ) : started(article) ? (
        <>
          <ProgressBar value={article.progress} className="w-12" />
          {Math.round(article.progress * 100)}%
        </>
      ) : (
        "Not started"
      )}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-secondary block h-1 overflow-hidden rounded-full",
        className,
      )}
    >
      <span
        className="bg-foreground/70 block h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </span>
  );
}

/** Something you are partway through, as a card to pick up from (Home's
 * and Papers' "Continue reading"). */
export function ReadingCard({ article }: { article: ArticleSummary }) {
  const percent = Math.round(article.progress * 100);
  return (
    <button
      type="button"
      onClick={() => void openSavedArticle(article.id)}
      aria-label={`${article.title}, ${percent}% read`}
      className="bg-card hover:border-input focus-visible:ring-ring/60 border-border flex flex-col rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2"
    >
      <SiteLogoTile
        url={article.canonicalUrl}
        icon={article.icon}
        site={article.site}
        className="-m-1.5 size-7 [&_img]:size-5"
      />
      <span className="text-lead mt-3 line-clamp-2 font-serif leading-snug font-medium">
        {article.title}
      </span>
      <span className="text-muted-foreground text-meta mt-1 truncate">
        {article.author || article.site}
      </span>
      <span className="mt-auto flex items-center gap-2.5 pt-4">
        <ProgressBar value={article.progress} className="flex-1" />
        <span className="text-muted-foreground text-caption tabular-nums">
          {percent}%
        </span>
      </span>
    </button>
  );
}

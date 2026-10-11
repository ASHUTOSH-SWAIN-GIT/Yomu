import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Download,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  exportArticleAsMarkdown,
  openOriginalPdf,
  refetchArticle,
  toggleArchived,
} from "@/lib/article-actions";
import { isPdfUrl } from "@/lib/pdf/identity";
import { useLibraryStore } from "@/stores/library-store";
import type { StoredArticle } from "@/types/library";

const ITEM =
  "hover:bg-accent focus-visible:bg-accent flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-ui outline-none [&>svg]:text-muted-foreground [&>svg]:size-4";

/** The "…" in the top bar while reading: the less frequent things to do
 * with the article (open the original, fetch it again, archive, export). */
export function ArticleMenu({ article }: { article: StoredArticle }) {
  const [open, setOpen] = useState(false);
  const archived = useLibraryStore(
    (s) =>
      s.articles.find((a) => a.id === article.id)?.archived ?? article.archived,
  );
  const pdf = isPdfUrl(article.canonicalUrl);
  const run = (action: () => unknown) => () => {
    setOpen(false);
    void action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="More actions" active={open}>
          <MoreHorizontal aria-hidden />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent role="menu" className="flex w-56 flex-col gap-0.5 p-1">
        {pdf ? (
          <button
            type="button"
            role="menuitem"
            onClick={run(() => openOriginalPdf(article))}
            className={ITEM}
          >
            <ArrowUpRight aria-hidden />
            Open in your PDF viewer
          </button>
        ) : (
          <a
            role="menuitem"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={ITEM}
          >
            <ArrowUpRight aria-hidden />
            Open the original page
          </a>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={run(() => refetchArticle(article))}
          className={ITEM}
        >
          <RefreshCw aria-hidden />
          {pdf ? "Read the PDF again" : "Fetch the page again"}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={run(() => exportArticleAsMarkdown(article))}
          className={ITEM}
        >
          <Download aria-hidden />
          Export as Markdown
        </button>
        <div aria-hidden className="bg-border mx-2 my-1 h-px" />
        <button
          type="button"
          role="menuitem"
          onClick={run(() => toggleArchived(article))}
          className={ITEM}
        >
          {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {archived ? "Move out of the archive" : "Archive"}
        </button>
      </PopoverContent>
    </Popover>
  );
}

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FolderPlus,
  Search,
  Trash2,
} from "lucide-react";
import { Confirm } from "@/components/ui/confirm";
import { IconButton } from "@/components/ui/icon-button";
import { ReadState } from "@/components/layout/reading-card";
import { finished, savedOn } from "@/lib/reading";
import { CollectionPicker } from "@/components/layout/collection-picker";
import { SiteLogoTile, SiteMark } from "@/components/layout/article-cover";
import { articleColor } from "@/lib/spaces";
import { deleteArticle, openSavedArticle } from "@/lib/navigate";
import { toggleArchived } from "@/lib/article-actions";
import { moveFocus } from "@/lib/list-focus";
import { matchesQuery } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { ArticleSummary } from "@/types/library";

/** The saved articles on Home (a list) and on the Archive page (rows), with
 * archive, delete and add-to-collection on each. */
export function LibraryList({
  list,
  archive,
  slots,
}: {
  list: ArticleSummary[];
  archive: boolean;
  slots: Record<string, number>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = query.trim()
    ? list.filter((a) => matchesQuery(`${a.title} ${a.site}`, query))
    : list;

  const props = (a: ArticleSummary) => ({
    article: a,
    color: articleColor(a, slots),
    confirming: confirmingId === a.id,
    onOpen: () => void openSavedArticle(a.id),
    onArchive: () => void toggleArchived(a),
    onDelete: () => setConfirmingId(a.id),
    onConfirm: (yes: boolean) => {
      setConfirmingId(null);
      if (yes) void deleteArticle(a.id);
    },
  });

  if (archive) {
    return (
      <Rows label={null}>
        {list.map((a) => (
          <Row key={a.id} {...props(a)} />
        ))}
      </Rows>
    );
  }

  return (
    // Arrow keys (or j/k) move between items, like a list in Linear.
    <div onKeyDown={moveFocus}>
      <div className="mt-12 flex items-center gap-2">
        <h2 className="text-lead font-semibold">All articles</h2>
        <span className="text-muted-foreground text-ui tabular-nums">
          {list.length}
        </span>
        {/* A long list gets a way to find one article in it. */}
        {list.length > 5 && (
          <label className="bg-muted text-muted-foreground focus-within:ring-ring/60 ml-auto flex h-8 w-56 items-center gap-2 rounded-lg px-2.5 focus-within:ring-2">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Find an article"
              aria-label="Find an article"
              className="placeholder:text-muted-foreground text-foreground text-ui min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        )}
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground text-ui mt-6">
          No article matches “{query.trim()}”.
        </p>
      )}
      <ul className="divide-border mt-3 flex flex-col divide-y">
        {shown.map((a) => (
          <HomeRow key={a.id} {...props(a)} />
        ))}
      </ul>
    </div>
  );
}

interface ItemProps {
  article: ArticleSummary;
  color: string;
  confirming: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onConfirm: (yes: boolean) => void;
}

/** One article in Home's list: its site's logo, the title with the site and
 * the day it was saved under it, and how far you are. */
function HomeRow({
  article,
  confirming,
  onOpen,
  onArchive,
  onDelete,
  onConfirm,
}: ItemProps) {
  if (confirming) {
    return (
      <li className="bg-muted flex h-[3.75rem] items-center px-2">
        <Confirm
          question={`Delete “${article.title}”?`}
          onConfirm={onConfirm}
          className="w-full"
        />
      </li>
    );
  }
  return (
    <li className="group hover:bg-muted/60 relative transition-colors duration-[var(--dur-fast)]">
      <button
        type="button"
        data-row
        onClick={onOpen}
        title={article.title}
        className="focus-visible:ring-ring/60 flex h-[3.75rem] w-full items-center gap-4 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <SiteLogoTile
          url={article.canonicalUrl}
          icon={article.icon}
          site={article.site}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "text-lead truncate font-medium",
              finished(article) && "text-muted-foreground",
            )}
          >
            {article.title}
          </span>
          <span className="text-muted-foreground text-meta truncate">
            {article.site} · Saved {savedOn(article)}
          </span>
        </span>
        <ReadState article={article} />
      </button>
      <Actions
        article={article}
        onArchive={onArchive}
        onDelete={onDelete}
        className="top-1/2 right-2 -translate-y-1/2"
      />
    </li>
  );
}

function Rows({
  label,
  children,
}: {
  label: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      {label && <h2 className="text-ui mb-2 font-medium">{label}</h2>}
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function Row({
  article,
  color,
  confirming,
  onOpen,
  onArchive,
  onDelete,
  onConfirm,
}: ItemProps) {
  if (confirming) {
    return (
      <li className="bg-muted flex h-14 items-center rounded-lg px-3">
        <Confirm
          question={`Delete “${article.title}”?`}
          onConfirm={onConfirm}
          className="w-full"
        />
      </li>
    );
  }
  return (
    <li className="group hover:bg-muted relative -mx-3 rounded-lg transition-colors duration-[var(--dur-fast)]">
      <button
        type="button"
        data-row
        onClick={onOpen}
        title={article.title}
        className="focus-visible:ring-ring/60 flex h-14 w-full items-center gap-3.5 rounded-lg px-3 text-left outline-none focus-visible:ring-2"
      >
        <SiteMark site={article.site} color={color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "text-lead truncate font-serif font-medium",
              finished(article) && "text-muted-foreground",
            )}
          >
            {article.title}
          </span>
          <span className="text-muted-foreground text-meta truncate">
            {article.site}
          </span>
        </span>
      </button>
      <Actions
        article={article}
        onArchive={onArchive}
        onDelete={onDelete}
        className="top-1/2 right-3 -translate-y-1/2"
      />
    </li>
  );
}

export function Actions({
  article,
  onArchive,
  onDelete,
  className,
}: {
  article: ArticleSummary;
  onArchive: () => void;
  onDelete: () => void;
  className?: string;
}) {
  // The collection list opens in a popover outside this bar, so keep the bar
  // showing while it is open.
  const [picking, setPicking] = useState(false);
  return (
    <span
      className={cn(
        "bg-card/90 absolute gap-0.5 rounded-lg p-0.5 shadow-[var(--shadow-float)] backdrop-blur-sm group-focus-within:flex group-hover:flex",
        picking ? "flex" : "hidden",
        className,
      )}
    >
      <CollectionPicker
        articleId={article.id}
        open={picking}
        onOpenChange={setPicking}
        trigger={
          <IconButton label="Add to a collection" size="md">
            <FolderPlus aria-hidden />
          </IconButton>
        }
      />
      <IconButton
        label={article.archived ? "Move out of the archive" : "Archive"}
        size="md"
        onClick={onArchive}
      >
        {article.archived ? (
          <ArchiveRestore aria-hidden />
        ) : (
          <Archive aria-hidden />
        )}
      </IconButton>
      <IconButton label="Delete" size="md" onClick={onDelete} danger>
        <Trash2 aria-hidden />
      </IconButton>
    </span>
  );
}

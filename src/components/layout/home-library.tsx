import { useState } from "react";
import { Archive, ArchiveRestore, FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollectionPicker } from "@/components/layout/collection-picker";
import { SiteLogoTile, SiteMark } from "@/components/layout/article-cover";
import { articleColor } from "@/lib/spaces";
import { deleteArticle, openSavedArticle } from "@/lib/navigate";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import type { ArticleSummary } from "@/types/library";

/** The saved blogs on Home (a list) and on the Archive page (rows), with
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
  const setArchived = useLibraryStore((s) => s.setArchived);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const props = (a: ArticleSummary) => ({
    article: a,
    color: articleColor(a, slots),
    confirming: confirmingId === a.id,
    onOpen: () => void openSavedArticle(a.id),
    onArchive: () => void setArchived(a.id, !a.archived),
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
      <div className="mt-14 flex items-baseline gap-2">
        <h2 className="text-[0.9375rem] font-semibold">All blogs</h2>
        <span className="text-muted-foreground text-[0.8125rem] tabular-nums">
          {list.length}
        </span>
      </div>
      <ul className="divide-border mt-3 flex flex-col divide-y">
        {list.map((a) => (
          <HomeRow key={a.id} {...props(a)} />
        ))}
      </ul>
    </div>
  );
}

function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const step =
    e.key === "ArrowDown" || e.key === "j" || e.key === "ArrowRight"
      ? 1
      : e.key === "ArrowUp" || e.key === "k" || e.key === "ArrowLeft"
        ? -1
        : 0;
  if (!step) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")];
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[Math.min(Math.max(i + step, 0), rows.length - 1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
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

/** One blog in Home's list: its site's logo, the title with the site under
 * it, how far you are, and when it was saved. */
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
          title={article.title}
          onConfirm={onConfirm}
          className="w-full"
        />
      </li>
    );
  }
  const finished = article.progress >= 0.95;
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
              "truncate text-[0.9375rem] font-medium",
              finished && "text-muted-foreground",
            )}
          >
            {article.title}
          </span>
          <span className="text-muted-foreground truncate text-[0.75rem]">
            {article.site}
          </span>
        </span>
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
      {label && <h2 className="mb-2 text-[0.8125rem] font-medium">{label}</h2>}
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
          title={article.title}
          onConfirm={onConfirm}
          className="w-full"
        />
      </li>
    );
  }
  const finished = article.progress >= 0.95;
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
              "truncate font-serif text-[0.9375rem] font-medium",
              finished && "text-muted-foreground",
            )}
          >
            {article.title}
          </span>
          <span className="text-muted-foreground truncate text-[0.75rem]">
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

function Actions({
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
          <button
            type="button"
            aria-label="Save to a collection"
            title="Save to a collection"
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 grid size-7 place-items-center rounded-md outline-none focus-visible:ring-2 [&>svg]:size-3.5"
          >
            <FolderPlus />
          </button>
        }
      />
      <IconButton
        label={article.archived ? "Move out of archive" : "Archive"}
        onClick={onArchive}
      >
        {article.archived ? <ArchiveRestore /> : <Archive />}
      </IconButton>
      <IconButton label="Delete" onClick={onDelete} danger>
        <Trash2 />
      </IconButton>
    </span>
  );
}

function Confirm({
  title,
  keepLabel = "Keep",
  note,
  onConfirm,
  className,
}: {
  title: string;
  keepLabel?: string;
  /** A short reassurance shown with the question. */
  note?: string;
  onConfirm: (yes: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 text-[0.8125rem]", className)}>
      <span className="line-clamp-2 min-w-0">
        Delete “{title}”?
        {note && <span className="text-muted-foreground"> {note}</span>}
      </span>
      <span className="ml-auto flex shrink-0 gap-1.5">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 px-2.5 text-[0.75rem]"
          onClick={() => onConfirm(true)}
        >
          Delete
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-[0.75rem]"
          onClick={() => onConfirm(false)}
        >
          {keepLabel}
        </Button>
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-accent focus-visible:ring-ring/60 grid size-7 place-items-center rounded-md outline-none focus-visible:ring-2 [&>svg]:size-3.5",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

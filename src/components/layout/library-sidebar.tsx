import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Library,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ArticleSummary, SearchHit } from "@/types/library";

const SEARCH_DEBOUNCE_MS = 200;
// Match markers in FTS snippets (see searchLibrary in lib/db.ts).
const MATCH_START = "\u0001";
const MATCH_END = "\u0002";

export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const loaded = useLibraryStore((s) => s.loaded);
  const view = useLibraryStore((s) => s.view);
  const tagFilter = useLibraryStore((s) => s.tagFilter);
  const hits = useLibraryStore((s) => s.hits);
  const refresh = useLibraryStore((s) => s.refresh);
  const remove = useLibraryStore((s) => s.remove);
  const setView = useLibraryStore((s) => s.setView);
  const setTagFilter = useLibraryStore((s) => s.setTagFilter);
  const search = useLibraryStore((s) => s.search);
  const setArchived = useLibraryStore((s) => s.setArchived);
  const readerState = useReaderStore((s) => s.state);
  const openArticle = useReaderStore((s) => s.openArticle);
  const openUrl = useReaderStore((s) => s.openUrl);

  const [query, setQuery] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Debounced full-text search over article text and chats.
  useEffect(() => {
    const timer = setTimeout(() => void search(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const byId = useMemo(
    () => new Map(articles.map((a) => [a.id, a])),
    [articles],
  );

  const inView = useMemo(
    () => articles.filter((a) => a.archived === (view === "archived")),
    [articles, view],
  );

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of inView) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [inView]);

  const filtered = useMemo(
    () =>
      tagFilter ? inView.filter((a) => a.tags.includes(tagFilter)) : inView,
    [inView, tagFilter],
  );

  const activeId =
    readerState.status === "ready" ? readerState.article.id : null;
  const searching = query.trim().length > 0;

  return (
    <aside className="border-border bg-muted/20 flex h-full w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Library className="text-muted-foreground size-4" />
          Library
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={addingUrl ? "Cancel" : "Add article"}
          onClick={() => setAddingUrl((v) => !v)}
        >
          {addingUrl ? <X className="size-4" /> : <Plus className="size-4" />}
        </Button>
      </div>

      {addingUrl && (
        <div className="px-3 pb-2">
          <AddUrlForm
            onSubmit={(url) => {
              void openUrl(url);
              setAddingUrl(false);
            }}
          />
        </div>
      )}

      <div className="px-3 pb-2">
        <div className="border-input bg-background flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
          <Search className="text-muted-foreground size-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles and chats"
            aria-label="Search articles and chats"
            className="placeholder:text-muted-foreground w-full bg-transparent outline-none"
          />
          {searching && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {!searching && (
        <div className="flex flex-col gap-2 px-3 pb-2">
          <div
            role="tablist"
            aria-label="Library view"
            className="bg-muted/60 grid grid-cols-2 gap-0.5 rounded-md p-0.5 text-xs"
          >
            {(["active", "archived"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "focus-visible:ring-ring/50 rounded px-2 py-1 capitalize outline-none focus-visible:ring-2",
                  view === v
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {v === "active" ? "Library" : "Archived"}
              </button>
            ))}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Filter by tag">
              {tags.map((tag) => (
                <button
                  key={tag}
                  aria-pressed={tagFilter === tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={cn(
                    "focus-visible:ring-ring/50 rounded-full border px-2 py-0.5 text-[11px] outline-none focus-visible:ring-2",
                    tagFilter === tag
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input text-muted-foreground hover:bg-accent",
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Separator />

      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : searching ? (
          <SearchResults
            hits={hits}
            byId={byId}
            activeId={activeId}
            onOpen={(id) => void openArticle(id)}
          />
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm">
            <p>
              {view === "archived"
                ? "Nothing archived."
                : articles.length === 0
                  ? "No articles yet."
                  : "No matches."}
            </p>
            {articles.length === 0 && (
              <p className="text-xs">Paste a link to get started.</p>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                active={activeId === article.id}
                confirming={confirmingId === article.id}
                onOpen={() => void openArticle(article.id)}
                onArchive={() =>
                  void setArchived(article.id, !article.archived)
                }
                onAskDelete={() => setConfirmingId(article.id)}
                onCancelDelete={() => setConfirmingId(null)}
                onDelete={() => {
                  setConfirmingId(null);
                  void remove(article.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ArticleRow({
  article,
  active,
  confirming,
  onOpen,
  onArchive,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  article: ArticleSummary;
  active: boolean;
  confirming: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const percent = Math.round(article.progress * 100);
  return (
    <li
      className={cn(
        "group hover:bg-accent focus-within:bg-accent flex items-start gap-1 px-3 py-2",
        active && "bg-accent",
      )}
    >
      {confirming ? (
        <div className="flex flex-1 items-center justify-between gap-2 text-sm">
          <span>Delete this article?</span>
          <div className="flex gap-1">
            <Button size="sm" variant="destructive" onClick={onDelete}>
              Delete
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* A real button so the row is reachable and activatable from
              the keyboard. */}
          <button
            type="button"
            className="focus-visible:ring-ring/50 min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2"
            aria-current={active ? "true" : undefined}
            onClick={onOpen}
          >
            <p className="text-foreground truncate text-sm font-medium">
              {article.title}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {article.site} · {formatRelativeTime(article.scrapedAt)}
              {percent > 0 && ` · ${percent >= 95 ? "read" : `${percent}%`}`}
            </p>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label={`${article.archived ? "Unarchive" : "Archive"} ${article.title}`}
            onClick={onArchive}
          >
            {article.archived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label={`Delete ${article.title}`}
            onClick={onAskDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

function SearchResults({
  hits,
  byId,
  activeId,
  onOpen,
}: {
  hits: SearchHit[] | null;
  byId: Map<string, ArticleSummary>;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  if (hits === null) {
    return (
      <div className="text-muted-foreground flex justify-center py-10">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  const results = hits.filter((h) => byId.has(h.articleId));
  if (results.length === 0) {
    return (
      <p className="text-muted-foreground px-6 py-10 text-center text-sm">
        No matches in articles or chats.
      </p>
    );
  }
  return (
    <ul aria-label="Search results">
      {results.map((hit) => {
        const article = byId.get(hit.articleId)!;
        return (
          <li key={hit.articleId}>
            <button
              type="button"
              onClick={() => onOpen(hit.articleId)}
              aria-current={activeId === hit.articleId ? "true" : undefined}
              className={cn(
                "hover:bg-accent focus-visible:ring-ring/50 w-full px-3 py-2 text-left outline-none focus-visible:ring-2",
                activeId === hit.articleId && "bg-accent",
              )}
            >
              <p className="text-foreground truncate text-sm font-medium">
                {article.title}
              </p>
              <p className="text-muted-foreground mt-0.5 line-clamp-3 text-xs">
                {hit.kind === "chat" && (
                  <span className="bg-muted mr-1 rounded px-1 py-0.5 text-[10px]">
                    in chat
                  </span>
                )}
                <Snippet text={hit.snippet} />
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Renders an FTS snippet, bolding the matches. The markers are control
 * characters, not HTML, so article text can never inject markup. */
function Snippet({ text }: { text: string }) {
  const [lead, ...rest] = text.replace(/\s+/g, " ").split(MATCH_START);
  return (
    <>
      <span>{lead}</span>
      {rest.map((chunk, i) => {
        const [match, after] = chunk.split(MATCH_END);
        return (
          <span key={i}>
            <mark className="text-foreground rounded bg-[var(--highlight)] px-0.5">
              {match}
            </mark>
            {after}
          </span>
        );
      })}
    </>
  );
}

function AddUrlForm({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (!url) return;
    onSubmit(url);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        autoFocus
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://..."
        aria-label="Article URL"
        className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
      />
    </form>
  );
}

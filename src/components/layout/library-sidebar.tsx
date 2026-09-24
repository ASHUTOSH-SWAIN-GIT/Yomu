import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Library, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const loaded = useLibraryStore((s) => s.loaded);
  const refresh = useLibraryStore((s) => s.refresh);
  const remove = useLibraryStore((s) => s.remove);
  const readerState = useReaderStore((s) => s.state);
  const openArticle = useReaderStore((s) => s.openArticle);
  const openUrl = useReaderStore((s) => s.openUrl);

  const [query, setQuery] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.site.toLowerCase().includes(q),
    );
  }, [articles, query]);

  const activeId =
    readerState.status === "ready" ? readerState.article.id : null;

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
            placeholder="Search articles"
            aria-label="Search articles"
            className="placeholder:text-muted-foreground w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm">
            <p>{articles.length === 0 ? "No articles yet." : "No matches."}</p>
            <p className="text-xs">
              {articles.length === 0 ? "Paste a link to get started." : ""}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((article) => (
              <li
                key={article.id}
                className={cn(
                  "group hover:bg-accent focus-within:bg-accent flex items-start gap-1 px-3 py-2",
                  activeId === article.id && "bg-accent",
                )}
              >
                {confirmingId === article.id ? (
                  <div className="flex flex-1 items-center justify-between gap-2 text-sm">
                    <span>Delete this article?</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setConfirmingId(null);
                          void remove(article.id);
                        }}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* A real button so the row is reachable and
                        activatable from the keyboard. */}
                    <button
                      type="button"
                      className="focus-visible:ring-ring/50 min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2"
                      aria-current={
                        activeId === article.id ? "true" : undefined
                      }
                      onClick={() => void openArticle(article.id)}
                    >
                      <p className="text-foreground truncate text-sm font-medium">
                        {article.title}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {article.site} · {formatRelativeTime(article.scrapedAt)}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      aria-label={`Delete ${article.title}`}
                      onClick={() => setConfirmingId(article.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
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
        className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
      />
    </form>
  );
}

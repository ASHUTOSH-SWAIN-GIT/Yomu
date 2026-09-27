import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Link as LinkIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { articlesInSpace, buildSpaces } from "@/lib/spaces";
import { openSampleArticle } from "@/lib/sample-article";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";
import type { ArticleSummary } from "@/types/library";

const ARCHIVE = "__archive";

/** The library: paste a link, then everything you have saved as a quiet
 * index, filtered by space. */
export function Home() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const setArchived = useLibraryStore((s) => s.setArchived);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const createSpace = useSpacesStore((s) => s.createSpace);
  const openArticle = useTabsStore((s) => s.openArticle);
  const deleteArticle = useTabsStore((s) => s.deleteArticle);

  const [input, setInput] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [naming, setNaming] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loading = state.status === "loading";
  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, active),
    [articles, extra, slots, active],
  );
  const archived = articles.filter((a) => a.archived);
  const list = showArchive ? archived : articlesInSpace(articles, active);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (url && !loading) void openUrl(url);
  }

  function pick(id: string) {
    setShowArchive(id === ARCHIVE);
    if (id !== ARCHIVE) setActive(id);
  }

  return (
    <div className="mx-auto w-full max-w-[40rem] px-6 pt-[clamp(3rem,16vh,8rem)] pb-40">
      <p className="text-muted-foreground font-serif text-[0.8125rem] italic">
        読む, to read
      </p>
      <h1 className="mt-1 text-[1.375rem] leading-tight font-medium tracking-[-0.015em]">
        What will you read next?
      </h1>

      <form
        onSubmit={submit}
        className="border-input focus-within:border-foreground mt-6 flex h-11 items-center gap-2.5 rounded-lg border pr-1.5 pl-3 transition-colors"
      >
        <LinkIcon
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        <input
          type="url"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Paste a link"
          aria-label="Article URL"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || !input.trim()}
          className="disabled:text-muted-foreground disabled:border-border h-8 rounded-md border border-transparent px-3 text-[0.75rem] disabled:bg-transparent disabled:opacity-100"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Open"}
        </Button>
      </form>
      {state.status === "error" && (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-3 rounded-lg border px-3 py-2.5 text-[0.75rem]"
        >
          {state.message}
        </p>
      )}

      {articles.length === 0 ? (
        <div className="mt-12">
          <p className="text-muted-foreground max-w-[26rem] text-[0.8125rem] leading-relaxed">
            Paste a link and it opens as a clean page. Select any passage to ask
            your local Codex about it, and the answer is written in the margin.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-[0.75rem]"
            onClick={() => void openSampleArticle()}
          >
            Take the two minute tour
          </Button>
        </div>
      ) : (
        <section className="mt-12" aria-label="Library">
          <nav
            aria-label="Spaces"
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem]"
          >
            {spaces.map((space) => (
              <Filter
                key={space.id}
                on={!showArchive && space.id === active}
                onClick={() => pick(space.id)}
                count={space.count}
              >
                {space.name}
              </Filter>
            ))}
            {archived.length > 0 && (
              <Filter
                on={showArchive}
                onClick={() => pick(ARCHIVE)}
                count={archived.length}
              >
                Archive
              </Filter>
            )}
            {naming ? (
              <NewSpace
                onDone={(name) => {
                  setNaming(false);
                  const id = name && createSpace(name);
                  if (id) pick(id);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded outline-none focus-visible:ring-1"
              >
                New space
              </button>
            )}
          </nav>

          <ul className="border-border mt-3 border-t">
            {list.length === 0 && (
              <li className="text-muted-foreground border-border border-b py-3 text-[0.75rem]">
                {showArchive
                  ? "Nothing archived."
                  : "Nothing here yet. Add an article to this space from its page."}
              </li>
            )}
            {list.map((a) =>
              confirmingId === a.id ? (
                <li
                  key={a.id}
                  className="border-border flex h-10 items-center gap-3 border-b text-[0.8125rem]"
                >
                  <span className="truncate">Delete “{a.title}”?</span>
                  <span className="ml-auto flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2.5 text-[0.75rem]"
                      onClick={() => {
                        setConfirmingId(null);
                        void deleteArticle(a.id);
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[0.75rem]"
                      onClick={() => setConfirmingId(null)}
                    >
                      Keep
                    </Button>
                  </span>
                </li>
              ) : (
                <Row
                  key={a.id}
                  article={a}
                  onOpen={() => void openArticle(a.id)}
                  onArchive={() => void setArchived(a.id, !a.archived)}
                  onDelete={() => setConfirmingId(a.id)}
                />
              ),
            )}
          </ul>

          <button
            type="button"
            onClick={() => void openSampleArticle()}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-6 rounded text-[0.75rem] underline underline-offset-4 outline-none focus-visible:ring-1"
          >
            Open the tour again
          </button>
        </section>
      )}
    </div>
  );
}

function Filter({
  on,
  onClick,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "focus-visible:ring-ring/60 rounded outline-none focus-visible:ring-1",
        on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(on && "underline decoration-1 underline-offset-[6px]")}
      >
        {children}
      </span>
      <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
    </button>
  );
}

function Row({
  article,
  onOpen,
  onArchive,
  onDelete,
}: {
  article: ArticleSummary;
  onOpen: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const percent = Math.round(article.progress * 100);
  return (
    <li className="group border-border relative border-b">
      <button
        type="button"
        onClick={onOpen}
        title={article.title}
        className="focus-visible:ring-ring/60 flex h-10 w-full items-baseline gap-3 pt-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset"
      >
        <span className="group-hover:text-foreground truncate text-[0.8125rem] text-white/85">
          {article.title}
        </span>
        <span className="text-muted-foreground hidden shrink-0 truncate text-[0.6875rem] sm:inline">
          {article.site}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0 text-[0.6875rem] tabular-nums group-focus-within:invisible group-hover:invisible">
          {percent > 0 && percent < 95
            ? `${percent}%`
            : formatRelativeTime(article.scrapedAt)}
        </span>
      </button>
      <span className="absolute top-2 right-0 hidden gap-0.5 group-focus-within:flex group-hover:flex">
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
    </li>
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
        "text-muted-foreground focus-visible:ring-ring/60 bg-background grid size-6 place-items-center rounded outline-none focus-visible:ring-1 [&>svg]:size-3.5",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NewSpace({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name your space"
        aria-label="New space name"
        maxLength={32}
        className="border-input placeholder:text-muted-foreground w-36 border-b bg-transparent text-[0.75rem] outline-none"
      />
    </form>
  );
}

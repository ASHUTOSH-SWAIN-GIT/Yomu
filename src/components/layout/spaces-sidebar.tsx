import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { articlesInSpace, buildSpaces, INBOX } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";
import type { ArticleSummary } from "@/types/library";

/**
 * Spaces (tags) with the active one expanded to its articles. One colour
 * per page: only the active space shows its colour; the others are neutral
 * outlines. Search lives in the command palette (Cmd/Ctrl+K).
 */
export function SpacesSidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const loaded = useLibraryStore((s) => s.loaded);
  const setArchived = useLibraryStore((s) => s.setArchived);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const createSpace = useSpacesStore((s) => s.createSpace);
  const openArticle = useTabsStore((s) => s.openArticle);
  const deleteArticle = useTabsStore((s) => s.deleteArticle);
  const reader = useReaderStore((s) => s.state);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const agentStatus = useAgentStore((s) => s.status);

  const [showArchive, setShowArchive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const openId = reader.status === "ready" ? reader.article.id : null;
  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, active),
    [articles, extra, slots, active],
  );
  const archived = useMemo(
    () => articles.filter((a) => a.archived),
    [articles],
  );
  const list = showArchive ? archived : articlesInSpace(articles, active);

  return (
    <aside
      aria-label="Spaces"
      className="bg-frame flex h-full w-64 shrink-0 flex-col px-3 pt-3.5 pb-3"
    >
      {/* Room for the macOS window controls when the title bar is an overlay. */}
      <div data-tauri-drag-region className="h-[var(--titlebar-h,0px)]" />
      <div className="px-2 pb-3.5">
        <Wordmark />
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="bg-background/60 text-muted-foreground hover:bg-background focus-visible:ring-ring/60 mb-4 flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors outline-none focus-visible:ring-2"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1">Search</span>
        <kbd className="border-border bg-muted rounded-md border px-1.5 text-[0.6875rem] font-semibold">
          {MOD}K
        </kbd>
      </button>

      <div className="text-muted-foreground flex items-center justify-between px-2 py-1.5 text-[0.75rem] font-semibold">
        Spaces
        <button
          type="button"
          aria-label="New space"
          onClick={() => setCreating((v) => !v)}
          className="hover:text-foreground focus-visible:ring-ring/60 rounded p-0.5 outline-none focus-visible:ring-2"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {creating && (
        <NewSpaceForm
          onDone={(name) => {
            if (name) createSpace(name);
            setCreating(false);
            setShowArchive(false);
          }}
        />
      )}

      <nav
        className="-mx-1 flex-1 overflow-y-auto px-1"
        aria-label="Your spaces"
      >
        {!loaded ? null : spaces.length === 0 && !showArchive ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-[0.8125rem]">
            No spaces yet. Add an article, then put it in a space.
          </p>
        ) : null}

        {spaces.map((space) => {
          const isActive = !showArchive && space.id === active;
          return (
            <div key={space.id}>
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  setActive(space.id);
                  setShowArchive(false);
                }}
                className={cn(
                  "focus-visible:ring-ring/60 flex h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left font-semibold outline-none focus-visible:ring-2",
                  isActive
                    ? "bg-background shadow-[0_1px_2px_rgb(20_21_26/0.08)]"
                    : "hover:bg-background/50",
                )}
              >
                <SpaceMark active={isActive} />
                <span className="flex-1 truncate">{space.name}</span>
                <span className="text-muted-foreground text-[0.8125rem] font-medium">
                  {space.count}
                </span>
              </button>
              {isActive && (
                <ArticleList
                  items={list}
                  openId={openId}
                  confirmingId={confirmingId}
                  setConfirmingId={setConfirmingId}
                  onOpen={(id) => void openArticle(id)}
                  onArchive={(a) => void setArchived(a.id, !a.archived)}
                  onDelete={(id) => void deleteArticle(id)}
                  emptyText={
                    space.id === INBOX
                      ? "Articles without a space land here."
                      : "Nothing in this space yet."
                  }
                />
              )}
            </div>
          );
        })}

        {archived.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              aria-current={showArchive ? "true" : undefined}
              onClick={() => setShowArchive((v) => !v)}
              className={cn(
                "focus-visible:ring-ring/60 flex h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left font-semibold outline-none focus-visible:ring-2",
                showArchive
                  ? "bg-background shadow-[0_1px_2px_rgb(20_21_26/0.08)]"
                  : "text-muted-foreground hover:bg-background/50",
              )}
            >
              <Archive className="size-3.5" aria-hidden />
              <span className="flex-1">Archive</span>
              <span className="text-muted-foreground text-[0.8125rem] font-medium">
                {archived.length}
              </span>
            </button>
            {showArchive && (
              <ArticleList
                items={list}
                openId={openId}
                confirmingId={confirmingId}
                setConfirmingId={setConfirmingId}
                onOpen={(id) => void openArticle(id)}
                onArchive={(a) => void setArchived(a.id, !a.archived)}
                onDelete={(id) => void deleteArticle(id)}
                emptyText="Nothing archived."
              />
            )}
          </div>
        )}
      </nav>

      <button
        type="button"
        onClick={() => setSetupOpen(true)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-2 flex items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] outline-none focus-visible:ring-2"
      >
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            agentStatus === "ready"
              ? "bg-emerald-500"
              : "bg-muted-foreground/50",
          )}
        />
        {agentStatus === "ready"
          ? "Codex ready"
          : agentStatus === "checking"
            ? "Checking Codex…"
            : "Set up Explain"}
        <Settings2 className="ml-auto size-3.5" aria-hidden />
      </button>
    </aside>
  );
}

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The colour square: only the active space shows its colour. */
function SpaceMark({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 shrink-0 rounded-[4px]",
        active ? "bg-space" : "ring-muted-foreground/45 ring-2 ring-inset",
      )}
    />
  );
}

function NewSpaceForm({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    onDone(value.trim() || null);
  }

  return (
    <form onSubmit={submit} className="px-1 pb-2">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name your space"
        aria-label="New space name"
        maxLength={32}
        className="border-input bg-background focus-visible:ring-ring/60 h-8 w-full rounded-lg border px-2.5 text-[0.8125rem] outline-none focus-visible:ring-2"
      />
    </form>
  );
}

function ArticleList({
  items,
  openId,
  confirmingId,
  setConfirmingId,
  onOpen,
  onArchive,
  onDelete,
  emptyText,
}: {
  items: ArticleSummary[];
  openId: string | null;
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  onOpen: (id: string) => void;
  onArchive: (article: ArticleSummary) => void;
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  return (
    <ul className="border-space/35 mt-0.5 mb-2 ml-[1.35rem] border-l-2 pl-2.5">
      {items.length === 0 && (
        <li className="text-muted-foreground py-2 text-[0.8125rem]">
          {emptyText}
        </li>
      )}
      {items.map((article) => {
        const current = article.id === openId;
        const percent = Math.round(article.progress * 100);
        return (
          <li key={article.id} className="group relative">
            {confirmingId === article.id ? (
              <div className="flex items-center justify-between gap-2 py-1 text-[0.8125rem]">
                <span>Delete?</span>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2.5"
                    onClick={() => {
                      setConfirmingId(null);
                      onDelete(article.id);
                    }}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5"
                    onClick={() => setConfirmingId(null)}
                  >
                    Keep
                  </Button>
                </span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(article.id)}
                  aria-current={current ? "true" : undefined}
                  title={article.title}
                  className={cn(
                    "focus-visible:ring-ring/60 flex h-[30px] w-full items-center gap-2 rounded-md pr-1 text-left text-[0.8125rem] outline-none group-focus-within:pr-14 group-hover:pr-14 focus-visible:ring-2",
                    current
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <i
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      current ? "bg-space" : "bg-border",
                    )}
                  />
                  <span className="truncate">{article.title}</span>
                  {percent > 0 && percent < 95 && (
                    <span className="text-muted-foreground/80 ml-auto text-[0.6875rem] tabular-nums group-focus-within:hidden group-hover:hidden">
                      {percent}%
                    </span>
                  )}
                </button>
                <span className="absolute top-0.5 right-0 hidden items-center group-focus-within:flex group-hover:flex">
                  <button
                    type="button"
                    aria-label={`${article.archived ? "Unarchive" : "Archive"} ${article.title}`}
                    onClick={() => onArchive(article)}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded p-1 outline-none focus-visible:ring-2"
                  >
                    {article.archived ? (
                      <ArchiveRestore className="size-3.5" />
                    ) : (
                      <Archive className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${article.title}`}
                    onClick={() => setConfirmingId(article.id)}
                    className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/60 rounded p-1 outline-none focus-visible:ring-2"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

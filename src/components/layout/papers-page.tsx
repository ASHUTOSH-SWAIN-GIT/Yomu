import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Check,
  CircleAlert,
  FileText,
  FileUp,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Actions, Confirm } from "@/components/layout/home-library";
import { moveFocus } from "@/lib/list-focus";
import { deleteArticle, openSavedArticle } from "@/lib/navigate";
import { isPdfUrl } from "@/lib/pdf/identity";
import { pickAndOpenPdf } from "@/lib/pdf/pick";
import { matchesQuery } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { usePaperImports } from "@/stores/paper-imports-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import type { ArticleSummary } from "@/types/library";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

const started = (a: ArticleSummary) => a.progress > 0.001;
const finished = (a: ArticleSummary) => a.progress >= 0.95;

/** Research papers: the PDFs opened from this computer, the one being read
 * in, and the way to add another. */
export function PapersPage() {
  const state = useReaderStore((s) => s.state);
  const articles = useLibraryStore((s) => s.articles);
  const dragging = useFileDrag();
  const papers = articles.filter(
    (a) => isPdfUrl(a.canonicalUrl) && !a.archived,
  );
  const reading = papers.filter((a) => started(a) && !finished(a)).slice(0, 3);
  const loading = state.status === "loading";

  return (
    <div className="relative mx-auto w-full max-w-[62rem] px-10 pt-14 pb-32">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-muted-foreground text-[0.8125rem]">Research</p>
          <h1 className="font-display mt-1.5 text-[2.25rem] leading-[1.12] font-semibold tracking-[-0.025em]">
            Papers
          </h1>
          <p className="text-muted-foreground mt-2 text-[0.8125rem]">
            Read PDFs page by page, and ask about any line.
          </p>
        </div>
      </header>

      {papers.length > 0 && <DropZone active={dragging} />}
      <ImportQueue />

      {state.status === "loading" && (
        <Importing
          name={state.url}
          detail={state.detail}
          fraction={state.fraction}
        />
      )}
      {state.status === "error" && (
        <div
          role="alert"
          className="bg-destructive/8 text-destructive mt-8 flex items-center gap-3 rounded-xl px-4 py-3 text-[0.8125rem] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_30%,transparent)]"
        >
          <span className="min-w-0 flex-1">{state.message}</span>
          <button
            type="button"
            onClick={() => void pickAndOpenPdf()}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Try another file
          </button>
        </div>
      )}

      {papers.length === 0 ? (
        !loading && <Empty />
      ) : (
        <>
          {reading.length > 0 && (
            <section className="mt-12">
              <h2 className="text-[0.9375rem] font-semibold">
                Continue reading
              </h2>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
                {reading.map((a) => (
                  <ReadingCard key={a.id} paper={a} />
                ))}
              </div>
            </section>
          )}
          <PaperList papers={papers} />
        </>
      )}

      {dragging && <DropOverlay />}
    </div>
  );
}

/** Whether a file is being dragged over the window (the drop itself is
 * handled by the app shell, wherever it lands). */
function useFileDrag(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        const t = e.payload.type;
        setOver(t === "enter" || t === "over");
      })
      .then((unlisten) => {
        if (gone) unlisten();
        else off = unlisten;
      })
      .catch(() => {});
    return () => {
      gone = true;
      off?.();
    };
  }, []);
  return over;
}

/** Where more papers go: always in sight once there is a list, and lit up
 * while a file is dragged over the window. Clicking it picks files. */
function DropZone({ active }: { active: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void pickAndOpenPdf()}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:border-foreground/40 focus-visible:ring-ring/60 mt-8 flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed px-4 py-4 text-[0.8125rem] transition-colors outline-none focus-visible:ring-2",
        active && "border-foreground/60 bg-accent text-foreground",
      )}
    >
      <FileUp className="size-4" aria-hidden />
      <span>
        Drop PDFs here to add them, several at once, or{" "}
        <span className="text-foreground underline underline-offset-2">
          choose files
        </span>
      </span>
      <kbd className="font-sans text-[0.6875rem] opacity-60">{MOD}O</kbd>
    </button>
  );
}

/** The PDFs being added together, each with how far along it is. */
function ImportQueue() {
  const items = usePaperImports((s) => s.items);
  const clearDone = usePaperImports((s) => s.clearDone);
  if (items.length === 0) return null;
  const done = items.filter(
    (i) => i.status !== "waiting" && i.status !== "reading",
  ).length;
  const finished = done === items.length;
  return (
    <section
      aria-label="Adding papers"
      className="bg-muted/50 mt-4 rounded-xl px-4 py-3"
    >
      <div className="flex items-center gap-3 text-[0.8125rem]">
        <span className="font-medium">
          {finished
            ? `Added ${items.filter((i) => i.status === "added").length} of ${items.length}`
            : `Adding papers · ${done} of ${items.length}`}
        </span>
        {finished && (
          <button
            type="button"
            onClick={clearDone}
            className="text-muted-foreground hover:text-foreground ml-auto text-[0.75rem] underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-3 text-[0.8125rem]"
            title={i.error}
          >
            <FileText
              className="text-muted-foreground size-3.5 shrink-0"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{i.name}</span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-[0.75rem] tabular-nums">
              {i.status === "waiting" && "Waiting"}
              {i.status === "reading" && (
                <>
                  <ProgressBar value={i.fraction ?? 0} className="w-16" />
                  {Math.round((i.fraction ?? 0) * 100)}%
                </>
              )}
              {i.status === "added" && (
                <>
                  <Check className="size-3.5" aria-hidden /> Added
                </>
              )}
              {i.status === "already" && "Already in Papers"}
              {i.status === "failed" && (
                <span className="text-destructive flex items-center gap-1">
                  <CircleAlert className="size-3.5" aria-hidden />
                  {i.error?.includes("no selectable text")
                    ? "Scanned, no text"
                    : "Could not read"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DropOverlay() {
  return (
    <div className="bg-background/80 pointer-events-none fixed inset-0 z-40 grid place-items-center backdrop-blur-sm">
      <div className="border-foreground/30 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-16 py-12">
        <FileUp className="size-8" aria-hidden />
        <p className="text-[0.9375rem] font-medium">Drop PDFs to add them</p>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mt-12 flex flex-col items-center rounded-3xl border border-dashed px-8 py-16 text-center">
      <span className="bg-muted grid size-14 place-items-center rounded-2xl">
        <FileText
          className="text-muted-foreground size-7"
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
      <h2 className="mt-5 text-[1.0625rem] font-semibold">No papers yet</h2>
      <p className="text-muted-foreground mt-1.5 max-w-[26rem] text-[0.8125rem] leading-relaxed">
        Open a research paper or any PDF from this computer. You'll read it a
        page at a time, with comments and the agent beside you.
      </p>
      <Button
        onClick={() => void pickAndOpenPdf()}
        className="mt-6 h-9 gap-2 rounded-lg px-4 text-[0.8125rem]"
      >
        <Plus className="size-4" aria-hidden />
        Open PDF
      </Button>
      <p className="text-muted-foreground mt-3 text-[0.75rem]">
        or drop PDFs anywhere, several at once · {MOD}O
      </p>
    </div>
  );
}

/** The PDF being read in: its name, and how far along (pages are known, so
 * the bar shows real progress). */
function Importing({
  name,
  detail,
  fraction,
}: {
  name: string;
  detail?: string;
  fraction?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-muted/60 mt-8 flex items-center gap-4 rounded-xl px-4 py-3.5"
    >
      <FileText className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
          <span className="truncate font-medium">{name}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {detail ?? "Opening…"}
          </span>
        </div>
        <div className="bg-secondary relative mt-2 h-[3px] overflow-hidden rounded-full">
          {fraction === undefined ? (
            <div className="bg-foreground absolute inset-y-0 left-0 w-1/3 animate-[yomu-slide_1.3s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full" />
          ) : (
            <div
              className="bg-foreground h-full rounded-full transition-[width] duration-200"
              style={{ width: `${Math.max(4, fraction * 100)}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
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

/** A paper you are partway through, as a card to pick up from. */
function ReadingCard({ paper }: { paper: ArticleSummary }) {
  return (
    <button
      type="button"
      onClick={() => void openSavedArticle(paper.id)}
      className="bg-card hover:border-input focus-visible:ring-ring/60 border-border flex flex-col rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2"
    >
      <FileText
        className="text-muted-foreground size-4"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="mt-3 line-clamp-2 font-serif text-[0.9375rem] leading-snug font-medium">
        {paper.title}
      </span>
      {paper.author && (
        <span className="text-muted-foreground mt-1 truncate text-[0.75rem]">
          {paper.author}
        </span>
      )}
      <span className="mt-auto flex items-center gap-2.5 pt-4">
        <ProgressBar value={paper.progress} className="flex-1" />
        <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
          {Math.round(paper.progress * 100)}%
        </span>
      </span>
    </button>
  );
}

function PaperList({ papers }: { papers: ArticleSummary[] }) {
  const setArchived = useLibraryStore((s) => s.setArchived);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = query.trim()
    ? papers.filter((a) => matchesQuery(`${a.title} ${a.author ?? ""}`, query))
    : papers;
  return (
    <section className="mt-12" onKeyDown={moveFocus}>
      <div className="flex items-center gap-2">
        <h2 className="text-[0.9375rem] font-semibold">All papers</h2>
        <span className="text-muted-foreground text-[0.8125rem] tabular-nums">
          {papers.length}
        </span>
        {/* A long list gets a way to find one paper in it. */}
        {papers.length > 5 && (
          <label className="bg-muted text-muted-foreground focus-within:ring-ring/60 ml-auto flex h-8 w-56 items-center gap-2 rounded-lg px-2.5 focus-within:ring-2">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a paper"
              aria-label="Find a paper"
              className="placeholder:text-muted-foreground text-foreground min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
            />
          </label>
        )}
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground mt-6 text-[0.8125rem]">
          No paper matches “{query.trim()}”.
        </p>
      )}
      <ul className="divide-border mt-3 flex flex-col divide-y">
        {shown.map((a) =>
          confirmingId === a.id ? (
            <li key={a.id} className="bg-muted flex h-16 items-center px-3">
              <Confirm
                title={a.title}
                className="w-full"
                onConfirm={(yes) => {
                  setConfirmingId(null);
                  if (yes) void deleteArticle(a.id);
                }}
              />
            </li>
          ) : (
            <PaperRow
              key={a.id}
              paper={a}
              onArchive={() => void setArchived(a.id, !a.archived)}
              onDelete={() => setConfirmingId(a.id)}
            />
          ),
        )}
      </ul>
    </section>
  );
}

function PaperRow({
  paper,
  onArchive,
  onDelete,
}: {
  paper: ArticleSummary;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const done = finished(paper);
  const added = new Date(paper.scrapedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return (
    <li className="group hover:bg-muted/60 relative transition-colors duration-[var(--dur-fast)]">
      <button
        type="button"
        data-row
        onClick={() => void openSavedArticle(paper.id)}
        title={paper.title}
        className="focus-visible:ring-ring/60 flex h-16 w-full items-center gap-4 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
          <FileText
            className="text-muted-foreground size-[1.125rem]"
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate font-serif text-[0.9375rem] font-medium",
              done && "text-muted-foreground",
            )}
          >
            {paper.title}
          </span>
          <span className="text-muted-foreground truncate text-[0.75rem]">
            {[paper.author, `Added ${added}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        {/* Where you are; hidden while the actions show in its place. */}
        <span className="text-muted-foreground flex w-24 shrink-0 items-center justify-end gap-2 text-[0.75rem] tabular-nums group-focus-within:invisible group-hover:invisible">
          {done ? (
            "Finished"
          ) : started(paper) ? (
            <>
              <ProgressBar value={paper.progress} className="w-12" />
              {Math.round(paper.progress * 100)}%
            </>
          ) : (
            "Not started"
          )}
        </span>
      </button>
      <Actions
        article={paper}
        onArchive={onArchive}
        onDelete={onDelete}
        className="top-1/2 right-2 -translate-y-1/2"
      />
    </li>
  );
}

import { useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CornerDownLeft,
  Link as LinkIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewCollection } from "@/components/layout/new-collection";
import { ArticleCover, SiteMark } from "@/components/layout/article-cover";
import { formatRelativeTime } from "@/lib/format";
import {
  articleColor,
  articlesInSpace,
  displaySpaceName,
  INBOX,
} from "@/lib/spaces";
import { openSampleArticle } from "@/lib/sample-article";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";
import type { ArticleSummary } from "@/types/library";

/** Home is just the box where you paste a link (with a loader while the page
 * is fetched). A collection shows its articles: in progress, waiting and
 * finished. The collections live in the sidebar. */
export function Home() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const active = useSpacesStore((s) => s.active);
  const slots = useSpacesStore((s) => s.slots);
  const showArchive = useSpacesStore((s) => s.showArchive);
  const creating = useSpacesStore((s) => s.creating);

  const [input, setInput] = useState("");
  const loading = state.status === "loading";
  const isHome = !showArchive && active === INBOX;
  // Home lists every saved article as cards; a collection lists its own.
  const list = showArchive
    ? articles.filter((a) => a.archived)
    : isHome
      ? articles.filter((a) => !a.archived)
      : articlesInSpace(articles, active);
  const reading = list.filter((a) => a.progress > 0 && a.progress < 0.95);
  const fresh = list.filter((a) => a.progress === 0);
  const done = list.filter((a) => a.progress >= 0.95);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (url && !loading) void openUrl(url);
  }

  const title = showArchive
    ? "Archive"
    : isHome
      ? "Read anything. Ask about any line."
      : displaySpaceName(active);
  const color =
    !showArchive && active !== INBOX && slots[active] !== undefined
      ? `var(--sp-${slots[active]})`
      : null;

  if (creating) return <NewCollection />;

  return (
    <div className="mx-auto w-full max-w-[54rem] px-10 pt-12 pb-32">
      <header>
        <p className="text-muted-foreground text-[0.8125rem]">{greeting()}</p>
        <h1 className="font-display mt-1 flex items-center gap-3 text-[2.125rem] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
          {color && (
            <i
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ background: color }}
            />
          )}
          {title}
        </h1>
        {!isHome && articles.length > 0 && (
          <p className="text-muted-foreground mt-2 text-[0.8125rem]">
            {summary(reading.length, fresh.length, done.length, showArchive)}
          </p>
        )}
      </header>

      {isHome && (
        <form
          onSubmit={submit}
          className="bg-card focus-within:ring-honey/35 mt-7 flex h-12 max-w-[32rem] items-center gap-3 rounded-none pr-1.5 pl-4 shadow-[var(--shadow-card)] transition-shadow duration-[var(--dur)] focus-within:shadow-[var(--shadow-card-hover)] focus-within:ring-2"
        >
          <LinkIcon
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
          <input
            type="url"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Paste a link to read it here"
            aria-label="Article URL"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !input.trim()}
            className="h-9 gap-2 rounded-none px-3.5 text-[0.8125rem]"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                Open
                <CornerDownLeft className="size-3.5 opacity-60" />
              </>
            )}
          </Button>
        </form>
      )}
      {state.status === "loading" && <Fetching url={state.url} />}
      {state.status === "error" && (
        <p
          role="alert"
          className="bg-destructive/8 text-destructive mt-3 rounded-lg px-3.5 py-2.5 text-[0.8125rem] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_30%,transparent)]"
        >
          {state.message}
        </p>
      )}

      {articles.length === 0 && isHome ? (
        !loading && <Welcome />
      ) : list.length === 0 ? (
        <p className="text-muted-foreground mt-14 text-center text-[0.8125rem]">
          {showArchive
            ? "Nothing archived."
            : "Nothing here yet. Open an article and add it to this collection from its page."}
        </p>
      ) : (
        <LibraryList
          reading={reading}
          fresh={fresh}
          done={done}
          archive={showArchive}
          cards={isHome}
          slots={slots}
        />
      )}
    </div>
  );
}

/** While a link is fetched: a bar that keeps sliding (the wait has no known
 * length, so it never claims a percentage) and what is being fetched. */
function Fetching({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL; show it as typed.
  }
  return (
    <div role="status" aria-live="polite" className="mt-4">
      <div className="bg-secondary relative h-[3px] w-full overflow-hidden rounded-full">
        <div className="bg-foreground absolute inset-y-0 left-0 w-1/3 animate-[yomu-slide_1.3s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full" />
      </div>
      <p className="text-muted-foreground mt-2.5 text-[0.8125rem]">
        Fetching {host}…
      </p>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5
    ? "Reading late"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
}

function summary(
  reading: number,
  fresh: number,
  done: number,
  archive: boolean,
) {
  if (archive) return `${reading + fresh + done} archived`;
  const parts = [
    reading && `${reading} in progress`,
    fresh && `${fresh} waiting`,
    done && `${done} finished`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Nothing here yet";
}

/** First run: what Yomu does, and the tour as the first thing to read. */
function Welcome() {
  return (
    <section className="mt-12">
      <p className="text-muted-foreground max-w-[30rem] text-[0.9375rem] leading-relaxed">
        Paste a link and it opens as a clean page. Select any passage to ask
        your local Codex about it, and the answer is written in the margin,
        right beside the words.
      </p>
      <button
        type="button"
        onClick={() => void openSampleArticle()}
        className="group bg-card focus-visible:ring-ring/60 mt-8 flex w-full max-w-[26rem] overflow-hidden rounded-none text-left shadow-[var(--shadow-card)] transition-shadow duration-[var(--dur)] outline-none hover:shadow-[var(--shadow-card-hover)] focus-visible:ring-2"
      >
        <ArticleCover
          site="yomu"
          color="var(--honey)"
          className="w-28 shrink-0"
        />
        <span className="flex flex-col justify-center gap-1 px-4 py-4">
          <span className="font-serif text-[1rem] font-medium">
            How to read with Yomu
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-[0.75rem]">
            A two minute tour
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </button>
    </section>
  );
}

function LibraryList({
  reading,
  fresh,
  done,
  archive,
  cards,
  slots,
}: {
  reading: ArticleSummary[];
  fresh: ArticleSummary[];
  done: ArticleSummary[];
  archive: boolean;
  /** Home: one grid of cards, newest first, no groups. */
  cards: boolean;
  slots: Record<string, number>;
}) {
  const openArticle = useTabsStore((s) => s.openArticle);
  const deleteArticle = useTabsStore((s) => s.deleteArticle);
  const setArchived = useLibraryStore((s) => s.setArchived);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const props = (a: ArticleSummary) => ({
    article: a,
    color: articleColor(a, slots),
    confirming: confirmingId === a.id,
    onOpen: () => void openArticle(a.id),
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
        {[...reading, ...fresh, ...done].map((a) => (
          <Row key={a.id} {...props(a)} />
        ))}
      </Rows>
    );
  }

  if (cards) {
    return (
      <div onKeyDown={moveFocus}>
        <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] gap-4">
          {[...reading, ...fresh, ...done].map((a) => (
            <Card key={a.id} {...props(a)} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    // Arrow keys (or j/k) move between items, like a list in Linear.
    <div onKeyDown={moveFocus}>
      {reading.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-[0.8125rem] font-medium">
            Continue reading
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] gap-4">
            {reading.map((a) => (
              <Card key={a.id} {...props(a)} />
            ))}
          </ul>
        </section>
      )}
      {fresh.length > 0 && (
        <Rows label="Up next">
          {fresh.map((a) => (
            <Row key={a.id} {...props(a)} />
          ))}
        </Rows>
      )}
      {done.length > 0 && (
        <Rows label="Finished">
          {done.map((a) => (
            <Row key={a.id} {...props(a)} />
          ))}
        </Rows>
      )}
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

function Card({
  article,
  color,
  confirming,
  onOpen,
  onArchive,
  onDelete,
  onConfirm,
}: ItemProps) {
  const percent = Math.round(article.progress * 100);
  return (
    <li className="group bg-card relative overflow-hidden rounded-none shadow-[var(--shadow-card)] transition-[box-shadow,transform] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-px hover:shadow-[var(--shadow-card-hover)]">
      <button
        type="button"
        data-row
        onClick={onOpen}
        title={article.title}
        className="focus-visible:ring-ring/60 flex w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <ArticleCover
          site={article.site}
          color={color}
          progress={article.progress}
          className="h-24 w-full"
        />
        <span className="flex flex-col gap-1.5 px-4 pt-3 pb-3.5">
          <span className="line-clamp-2 font-serif text-[0.9375rem] leading-snug font-medium">
            {article.title}
          </span>
          <span className="text-muted-foreground flex items-center gap-2 text-[0.75rem]">
            <span className="truncate">{article.site}</span>
            <span className="ml-auto shrink-0 tabular-nums">{percent}%</span>
          </span>
        </span>
      </button>
      <Actions
        article={article}
        onArchive={onArchive}
        onDelete={onDelete}
        className="top-2 right-2"
      />
      {confirming && (
        <Confirm
          title={article.title}
          onConfirm={onConfirm}
          className="bg-card/95 absolute inset-0 flex-col justify-center p-4 backdrop-blur-sm"
        />
      )}
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
        <span className="text-muted-foreground shrink-0 text-[0.75rem] tabular-nums group-focus-within:invisible group-hover:invisible">
          {formatRelativeTime(article.scrapedAt)}
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
  return (
    <span
      className={cn(
        "bg-card absolute hidden gap-0.5 rounded-lg p-0.5 shadow-[var(--shadow-card)] group-focus-within:flex group-hover:flex",
        className,
      )}
    >
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
  onConfirm,
  className,
}: {
  title: string;
  onConfirm: (yes: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 text-[0.8125rem]", className)}>
      <span className="line-clamp-2 min-w-0">Delete “{title}”?</span>
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
          Keep
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

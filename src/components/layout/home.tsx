import { useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CornerDownLeft,
  FolderPlus,
  Link as LinkIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibraryChat } from "@/components/chat/library-chat";
import { SettingsPage } from "@/components/settings/settings-page";
import { CollectionPicker } from "@/components/layout/collection-picker";
import { SiteLogoTile, SiteMark } from "@/components/layout/article-cover";
import { articleColor } from "@/lib/spaces";
import { openSampleArticle } from "@/lib/sample-article";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useUiStore } from "@/stores/ui-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { deleteArticle, openSavedArticle } from "@/lib/navigate";
import type { ArticleSummary } from "@/types/library";

/** Home: the box where you paste a link (with a loader while the page is
 * fetched) and the list of every saved blog. The Archive page reuses it.
 * Collections live in the sidebar, with their blogs under them. */
export function Home() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const slots = useSpacesStore((s) => s.slots);
  const showArchive = useSpacesStore((s) => s.showArchive);
  const libraryChat = useSpacesStore((s) => s.libraryChat);
  const settingsPage = useSpacesStore((s) => s.settingsPage);

  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const [input, setInput] = useState("");
  const loading = state.status === "loading";
  const isHome = !showArchive;
  const list = articles.filter((a) => a.archived === showArchive);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (url && !loading) void openUrl(url);
  }

  const title = showArchive ? "Archive" : "Read anything. Ask about any line.";

  if (settingsPage) return <SettingsPage />;
  if (libraryChat) return <LibraryChat />;

  return (
    <div className="mx-auto w-full max-w-[62rem] px-10 pt-14 pb-32">
      <header>
        <p className="text-muted-foreground text-[0.8125rem]">{greeting()}</p>
        <h1 className="font-display mt-1.5 text-[2.25rem] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {showArchive && list.length > 0 && (
          <p className="text-muted-foreground mt-2 text-[0.8125rem]">
            {list.length} archived
          </p>
        )}
      </header>

      {isHome && (
        <form
          onSubmit={submit}
          className="bg-muted mt-8 flex h-13 max-w-[38rem] items-center gap-3 rounded-2xl pr-1.5 pl-4"
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
            className="h-10 gap-2 rounded-lg px-4 text-[0.8125rem]"
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
      {isHome && agentStatus === "setup" && (
        <p className="text-muted-foreground mt-3 text-[0.8125rem]">
          Connect an AI agent to ask about what you read.{" "}
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="text-foreground underline underline-offset-2 outline-none hover:opacity-80"
          >
            Set up
          </button>
        </p>
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
          {showArchive ? "Nothing archived." : "Nothing here yet."}
        </p>
      ) : (
        <LibraryList list={list} archive={showArchive} slots={slots} />
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

/** First run: what Yomu does, and the tour as the first thing to read. */
/** What a new reader sees before saving anything: four illustrated cards,
 * one per thing Yomu does, each a shortcut to trying it. */
const STEPS = [
  {
    art: "/welcome/link.svg",
    title: "Paste any link",
    text: "Blogs, docs, papers. Each opens as a clean page and is saved for later.",
    action: "Try the tour",
  },
  {
    art: "/welcome/ask.svg",
    title: "Ask about any line",
    text: "Select a passage and ask. The answer appears right beside the words.",
    action: "Open the tour",
  },
  {
    art: "/welcome/chat.svg",
    title: "Chat with your agent",
    text: "Talk with Codex or OpenCode about what you read, or about anything.",
    action: "Start a chat",
  },
  {
    art: "/welcome/collect.svg",
    title: "Comment and collect",
    text: "Leave notes on lines you like and sort blogs into collections.",
    action: "Open settings",
  },
] as const;

function Welcome() {
  const setLibraryChat = useSpacesStore((s) => s.setLibraryChat);
  const setSettingsPage = useSpacesStore((s) => s.setSettingsPage);
  const resetChat = useLibraryChatStore((s) => s.reset);
  const actions = [
    () => void openSampleArticle(),
    () => void openSampleArticle(),
    () => {
      void resetChat();
      setLibraryChat(true);
    },
    () => setSettingsPage(true),
  ];

  return (
    <section className="mt-12">
      <h2 className="text-muted-foreground text-[0.8125rem] font-medium">
        Getting started
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            type="button"
            onClick={actions[i]}
            className="group bg-card border-border focus-visible:ring-ring/60 flex flex-col overflow-hidden rounded-xl border text-left transition-[translate,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] focus-visible:ring-2"
          >
            <span className="block aspect-[4/3] overflow-hidden">
              <img
                src={step.art}
                alt=""
                draggable={false}
                className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
              />
            </span>
            <span className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
              <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                {step.title}
              </span>
              <span className="text-muted-foreground text-[0.75rem] leading-snug">
                {step.text}
              </span>
              <span className="text-foreground/80 mt-1 flex items-center gap-1.5 text-[0.6875rem] font-medium">
                {step.action}
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LibraryList({
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

import { useState, type FormEvent } from "react";
import { CornerDownLeft, Link as LinkIcon, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LibraryChat } from "@/components/chat/library-chat";
import { SettingsPage } from "@/components/settings/settings-page";
import { LibraryList } from "@/components/layout/home-library";
import { Fetching } from "@/components/layout/fetching";
import { Welcome } from "@/components/layout/home-welcome";
import { ReadingCard } from "@/components/layout/reading-card";
import { inProgress } from "@/lib/reading";
import { PapersPage } from "@/components/layout/papers-page";
import { isPdfUrl } from "@/lib/pdf/identity";
import { useAgentStore } from "@/stores/agent-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** Home: the box where you paste a link (with a loader while the page is
 * fetched), what you are partway through, and the list of every saved
 * article. The Inbox and Archive pages reuse it. Collections live in the
 * sidebar, with their articles under them. */
export function Home() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const slots = useSpacesStore((s) => s.slots);
  const showArchive = useViewStore((s) => s.showArchive);
  const showInbox = useViewStore((s) => s.showInbox);
  const libraryChat = useViewStore((s) => s.libraryChat);
  const settingsPage = useViewStore((s) => s.settingsPage);
  const papersPage = useViewStore((s) => s.papersPage);

  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const [input, setInput] = useState("");
  const loading = state.status === "loading";
  const isHome = !showArchive && !showInbox;
  const list = showInbox
    ? articles.filter((a) => a.inbox && !a.archived)
    : articles.filter(
        // A bookmarked page waits in the Inbox until it is in a collection.
        // PDFs have their own page (Papers).
        (a) =>
          a.archived === showArchive &&
          (showArchive || (!a.inbox && !isPdfUrl(a.canonicalUrl))),
      );

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (url && !loading) void openUrl(url);
  }

  // A new reader is told what Yomu is; after that, Home just says hello.
  const fresh = articles.length === 0;
  const title = showInbox
    ? "Inbox"
    : showArchive
      ? "Archive"
      : fresh
        ? "Read anything, with your agent beside you."
        : greeting();
  const continuing = isHome ? list.filter(inProgress).slice(0, 3) : [];

  if (settingsPage) return <SettingsPage />;
  if (papersPage) return <PapersPage />;
  if (libraryChat) return <LibraryChat />;

  return (
    <div className="mx-auto w-full max-w-[62rem] px-10 pt-14 pb-32">
      <header>
        {isHome && fresh && (
          <p className="text-muted-foreground text-ui mb-1.5">{greeting()}</p>
        )}
        <h1
          className={
            "font-display leading-[1.12] font-semibold tracking-[-0.025em] text-balance " +
            (isHome && !fresh ? "text-headline" : "text-display")
          }
        >
          {title}
        </h1>
        {showInbox && (
          <p className="text-muted-foreground text-ui mt-2">
            Pages from your Yomu bookmarks folder and blogs you subscribe to.
            File one into a collection and it leaves the Inbox.
          </p>
        )}
        {showArchive && list.length > 0 && (
          <p className="text-muted-foreground text-ui mt-2">
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
            className="placeholder:text-muted-foreground text-lead min-w-0 flex-1 bg-transparent outline-none"
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !input.trim()}
            className="text-ui h-10 gap-2 rounded-lg px-4"
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
      {isHome && (agentStatus === "setup" || agentStatus === "off") && (
        <p className="text-muted-foreground text-ui mt-3">
          {agentStatus === "off"
            ? "Turn on an AI agent to ask about what you read."
            : "Connect an AI agent to ask about what you read."}{" "}
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="text-foreground underline underline-offset-2 outline-none hover:opacity-80"
          >
            {agentStatus === "off" ? "Turn on" : "Set up"}
          </button>
        </p>
      )}
      {state.status === "loading" && (
        <Fetching url={state.url} detail={state.detail} />
      )}
      {state.status === "error" && (
        <Alert
          className="mt-3 max-w-[38rem]"
          action={
            // A failed PDF says so on the Papers page, with its own retry.
            /^https?:/i.test(state.url)
              ? { label: "Try again", onClick: () => void openUrl(state.url) }
              : undefined
          }
        >
          {state.message}
        </Alert>
      )}

      {continuing.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lead font-semibold">Continue reading</h2>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {continuing.map((a) => (
              <ReadingCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {fresh && isHome ? (
        !loading && <Welcome />
      ) : list.length === 0 ? (
        <p className="text-muted-foreground text-ui mt-14 text-center">
          {showInbox
            ? "Nothing waiting."
            : showArchive
              ? "Nothing archived."
              : "Nothing here yet. Paste a link above to save your first article."}
        </p>
      ) : (
        <LibraryList list={list} archive={showArchive} slots={slots} />
      )}
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

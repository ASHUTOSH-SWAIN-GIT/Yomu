import { useState, type FormEvent } from "react";
import { CornerDownLeft, Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibraryChat } from "@/components/chat/library-chat";
import { SettingsPage } from "@/components/settings/settings-page";
import { LibraryList } from "@/components/layout/home-library";
import { Welcome } from "@/components/layout/home-welcome";
import { useAgentStore } from "@/stores/agent-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** Home: the box where you paste a link (with a loader while the page is
 * fetched) and the list of every saved blog. The Archive page reuses it.
 * Collections live in the sidebar, with their blogs under them. */
export function Home() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const slots = useSpacesStore((s) => s.slots);
  const showArchive = useViewStore((s) => s.showArchive);
  const libraryChat = useViewStore((s) => s.libraryChat);
  const settingsPage = useViewStore((s) => s.settingsPage);

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

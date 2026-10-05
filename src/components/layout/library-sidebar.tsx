import { useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  MessageSquarePlus,
  Plus,
  X,
} from "lucide-react";
import { SiteFavicon } from "@/components/layout/article-cover";
import { readStorage, writeStorage } from "@/lib/storage";
import { articlesInSpace, buildSpaces, INBOX } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { goHome, openSavedArticle } from "@/lib/navigate";
import { useReaderStore } from "@/stores/reader-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useUiStore } from "@/stores/ui-store";

const FOLDED_KEY = "yomu-sidebar-folded";

/** The library's navigation, on the window frame beside the page: Home, your
 * collections, the archive, and the way to add a collection. */
export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const showArchive = useSpacesStore((s) => s.showArchive);
  const setShowArchive = useSpacesStore((s) => s.setShowArchive);
  const libraryChat = useSpacesStore((s) => s.libraryChat);
  const setLibraryChat = useSpacesStore((s) => s.setLibraryChat);
  const resetChat = useLibraryChatStore((s) => s.reset);
  const reading = useReaderStore((s) => s.state.status === "ready");
  const readingId = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article.id : null,
  );

  // Collections show their blogs underneath; these are the ones folded shut.
  const [folded, setFolded] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(readStorage(FOLDED_KEY) ?? "[]");
      return Array.isArray(saved)
        ? saved.filter((x) => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  });
  function toggleFolded(id: string) {
    const next = folded.includes(id)
      ? folded.filter((f) => f !== id)
      : [...folded, id];
    setFolded(next);
    writeStorage(FOLDED_KEY, JSON.stringify(next));
  }

  // Picking anything here while reading a blog leaves the blog for it.
  const leave = () => {
    if (reading) void goHome();
  };
  const createSpace = useSpacesStore((s) => s.createSpace);
  const [naming, setNaming] = useState(false);
  const deleteSpace = useSpacesStore((s) => s.deleteSpace);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const peek = useUiStore((s) => s.sidebarPeek);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const shown = sidebarOpen || peek;

  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, active),
    [articles, extra, slots, active],
  );
  // Removing a collection keeps its articles: they just lose the tag and show
  // on Home again.
  async function removeCollection(id: string) {
    const tagged = articles.filter((a) => a.tags.includes(id));
    await Promise.all(tagged.map((a) => removeTag(a.id, id)));
    deleteSpace(id);
  }

  const archived = articles.filter((a) => a.archived).length;
  const named = spaces.filter((s) => s.id !== INBOX);

  return (
    <nav
      aria-label="Collections"
      inert={!shown}
      onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
      onMouseLeave={() => peekSidebar(false)}
      className={cn(
        "bg-frame border-border flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto px-2 pb-3 text-[0.8125rem]",
        // Docked, the contents sit a little below the top; the floating panel
        // already starts below the top bar.
        sidebarOpen ? "border-r pt-8" : "pt-2",
        // Collapsed: a small panel floating over the page, parked off-screen
        // and slid in on hover. The shadow rides the same transition so it
        // fades with the slide. Clicking the toggle docks it full height.
        !sidebarOpen &&
          "absolute top-11 left-2 z-30 h-fit max-h-[calc(100%-3.25rem)] rounded-md border transition-[translate,box-shadow,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[translate]",
        !sidebarOpen &&
          (peek
            ? "shadow-[var(--shadow-float)]"
            : "invisible -translate-x-[calc(100%+1rem)] shadow-none"),
      )}
    >
      <Item
        on={!reading && !showArchive && !libraryChat && active === INBOX}
        onClick={() => {
          setActive(INBOX);
          leave();
        }}
        icon={<Home />}
      >
        Home
      </Item>

      <h2 className="text-foreground mt-5 mb-1 px-2.5 text-[0.8125rem] font-bold">
        Chat
      </h2>
      <Item
        on={!reading && libraryChat}
        onClick={() => {
          void resetChat();
          setLibraryChat(true);
          leave();
        }}
        icon={<MessageSquarePlus />}
      >
        New chat
      </Item>

      <h2 className="text-foreground mt-5 mb-1 px-2.5 text-[0.8125rem] font-bold">
        My collection
      </h2>
      {naming ? (
        <NewCollectionName
          onDone={(name) => {
            setNaming(false);
            if (name && createSpace(name)) leave();
          }}
        />
      ) : (
        <Item on={false} onClick={() => setNaming(true)} icon={<Plus />}>
          New collection
        </Item>
      )}
      {named.map((space) => {
        const blogs = articlesInSpace(articles, space.id);
        const open = !folded.includes(space.id);
        return (
          <div key={space.id} className="group relative flex flex-col">
            {blogs.length > 0 && (
              <button
                type="button"
                onClick={() => toggleFolded(space.id)}
                aria-label={`${open ? "Hide" : "Show"} the blogs in ${space.name}`}
                aria-expanded={open}
                className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 absolute top-[5px] left-1 z-10 grid size-5 place-items-center rounded-sm outline-none focus-visible:ring-2"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform duration-[var(--dur-fast)]",
                    open && "rotate-90",
                  )}
                  aria-hidden
                />
              </button>
            )}
            <Item
              className="pl-7"
              on={
                !reading && !showArchive && !libraryChat && active === space.id
              }
              onClick={() => {
                setActive(space.id);
                leave();
              }}
              icon={open ? <FolderOpen /> : <Folder />}
              count={space.count}
            >
              {space.name}
            </Item>
            <button
              type="button"
              onClick={() => void removeCollection(space.id)}
              aria-label={`Remove ${space.name}`}
              title="Remove collection (articles are kept)"
              className="text-muted-foreground hover:text-foreground bg-accent focus-visible:ring-ring/60 absolute top-[5px] right-1.5 grid size-5 place-items-center rounded-sm opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
            >
              <X className="size-3.5" aria-hidden />
            </button>
            {open && blogs.length > 0 && (
              <ul className="mt-0.5 mb-1 flex flex-col gap-px">
                {blogs.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => void openSavedArticle(a.id)}
                      title={a.title}
                      aria-current={readingId === a.id ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/60 flex h-7 w-full items-center gap-2 rounded-md pr-2 pl-7 text-left text-[0.75rem] outline-none focus-visible:ring-2",
                        readingId === a.id
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                      )}
                    >
                      <SiteFavicon
                        url={a.canonicalUrl}
                        icon={a.icon}
                        site={a.site}
                      />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {archived > 0 && (
        <>
          <div className="mt-5" />
          <Item
            on={!reading && showArchive}
            onClick={() => {
              setShowArchive(true);
              leave();
            }}
            icon={<Archive />}
            count={archived}
          >
            Archive
          </Item>
        </>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left text-[0.75rem] outline-none focus-visible:ring-2"
        >
          <span
            aria-hidden
            className={cn(
              "mx-[5px] size-1.5 rounded-full",
              agentStatus === "ready"
                ? "bg-[var(--sp-1)]"
                : agentStatus === "checking"
                  ? "bg-muted-foreground animate-pulse"
                  : "bg-honey",
            )}
          />
          {agentStatus === "ready"
            ? "Codex connected"
            : agentStatus === "checking"
              ? "Checking Codex…"
              : "Set up Explain"}
        </button>
      </div>
    </nav>
  );
}

function Item({
  on,
  onClick,
  icon,
  count,
  className,
  children,
}: {
  className?: string;
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/60 flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className,
        on
          ? "bg-accent text-foreground font-medium"
          : "text-foreground/80 hover:bg-accent/70 hover:text-foreground [&>svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span className="text-muted-foreground text-[0.6875rem] font-normal tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

/** The name field that replaces the "New collection" button while naming. */
function NewCollectionName({
  onDone,
}: {
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
      className="px-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name your collection"
        aria-label="New collection name"
        maxLength={32}
        className="bg-muted placeholder:text-muted-foreground h-8 w-full rounded-md px-2.5 text-[0.8125rem] outline-none"
      />
    </form>
  );
}

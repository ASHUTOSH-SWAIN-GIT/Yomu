import { useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  MessageSquarePlus,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { SiteFavicon } from "@/components/layout/article-cover";
import { readStorage, writeStorage } from "@/lib/storage";
import { articlesInSpace, buildSpaces, INBOX } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { removeCollection } from "@/lib/collections";
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
  // The collection last clicked: it is the one whose options show.
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const settingsPage = useSpacesStore((s) => s.settingsPage);
  const setSettingsPage = useSpacesStore((s) => s.setSettingsPage);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const peek = useUiStore((s) => s.sidebarPeek);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const shown = sidebarOpen || peek;

  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, ""),
    [articles, extra, slots],
  );
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
        on={!reading && !showArchive && !libraryChat && !settingsPage}
        onClick={() => {
          setActive(INBOX);
          setSelected(null);
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
          setSelected(null);
          leave();
        }}
        icon={<MessageSquarePlus />}
      >
        New chat
      </Item>

      <h2 className="text-foreground mt-5 mb-1 px-2.5 text-[0.8125rem] font-bold">
        My collection
      </h2>
      <Item on={false} onClick={() => setNaming(true)} icon={<Plus />}>
        New collection
      </Item>
      {naming && (
        // A new folder appears in the list, ready to be named.
        <NewFolder
          onDone={(name) => {
            setNaming(false);
            const id = name ? createSpace(name) : null;
            if (id) {
              setSelected(id);
              leave();
            }
          }}
        />
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
              on={selected === space.id}
              onClick={() => {
                // Clicking a collection opens or folds its blogs and shows
                // its options.
                setSelected(space.id);
                setConfirming(null);
                if (blogs.length > 0) toggleFolded(space.id);
              }}
              icon={open ? <FolderOpen /> : <Folder />}
              count={selected === space.id ? undefined : space.count}
            >
              {space.name}
            </Item>
            {selected === space.id && (
              <button
                type="button"
                onClick={() => setConfirming(space.id)}
                aria-label={`Delete ${space.name}`}
                title="Delete collection (the blogs are kept)"
                className="text-muted-foreground hover:text-destructive hover:bg-background/60 focus-visible:ring-ring/60 absolute top-[5px] right-1.5 grid size-5 place-items-center rounded-sm outline-none focus-visible:ring-2"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
            {confirming === space.id && (
              <div className="bg-accent/60 mx-1 mt-0.5 mb-1 flex flex-col gap-2 rounded-md p-2 text-[0.75rem]">
                <span>
                  Delete “{space.name}”?
                  <span className="text-muted-foreground">
                    {" "}
                    The blogs are kept.
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      setSelected(null);
                      void removeCollection(space.id);
                    }}
                    className="bg-destructive text-destructive-foreground focus-visible:ring-ring/60 h-6 rounded-md px-2.5 font-medium outline-none focus-visible:ring-2"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="hover:bg-accent focus-visible:ring-ring/60 h-6 rounded-md px-2.5 outline-none focus-visible:ring-2"
                  >
                    Cancel
                  </button>
                </span>
              </div>
            )}
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
              setSelected(null);
              leave();
            }}
            icon={<Archive />}
            count={archived}
          >
            Archive
          </Item>
        </>
      )}

      <h2 className="text-foreground mt-6 mb-1 px-2.5 text-[0.8125rem] font-bold">
        Customize
      </h2>
      <Item
        on={!reading && settingsPage}
        onClick={() => {
          setSettingsPage(true);
          setSelected(null);
          leave();
        }}
        icon={<SlidersHorizontal />}
      >
        Make it yours
      </Item>

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        {/* Only shown when the agent needs attention; "connected" needs no
            text. */}
        {agentStatus !== "ready" && (
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left text-[0.75rem] outline-none focus-visible:ring-2"
          >
            <span
              aria-hidden
              className={cn(
                "mx-[5px] size-1.5 rounded-full",
                agentStatus === "checking"
                  ? "bg-muted-foreground animate-pulse"
                  : "bg-honey",
              )}
            />
            {agentStatus === "checking"
              ? "Checking the agent…"
              : "Set up Explain"}
          </button>
        )}
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

/** A new, unnamed folder in the list: type its name, Enter to keep it. */
function NewFolder({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
      className="bg-accent/70 flex h-[30px] items-center gap-2.5 rounded-md pr-2 pl-7"
    >
      <Folder className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name this folder"
        aria-label="New collection name"
        maxLength={32}
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
      />
    </form>
  );
}

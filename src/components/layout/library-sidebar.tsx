import { useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Inbox,
  MoreHorizontal,
  MessageCircle,
  Pencil,
  SquarePen,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { SiteFavicon } from "@/components/layout/article-cover";
import { isPdfUrl } from "@/lib/pdf/identity";
import { readStorage, writeStorage } from "@/lib/storage";
import { articlesInSpace, buildSpaces, INBOX } from "@/lib/spaces";
import { WithContextMenu } from "@/components/ui/context-menu";
import { Confirm } from "@/components/ui/confirm";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { removeCollection, renameCollection } from "@/lib/collections";
import {
  goHome,
  openArticleInNewTab,
  openChatInNewTab,
  openSavedArticle,
} from "@/lib/navigate";
import { useAgentStore } from "@/stores/agent-store";
import { useReaderStore } from "@/stores/reader-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";

const FOLDED_KEY = "yomu-sidebar-folded";
const CHATS_FOLDED_KEY = "yomu-sidebar-chats-folded";
/** Previous chats shown before "View all". */
const RECENT_CHATS = 5;

/** The library's navigation, on the window frame beside the page: Home,
 * Papers, chats, your collections and the archive, with Settings at the
 * foot. */
export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const showArchive = useViewStore((s) => s.showArchive);
  const showInbox = useViewStore((s) => s.showInbox);
  const setShowInbox = useViewStore((s) => s.setShowInbox);
  const papersPage = useViewStore((s) => s.papersPage);
  const setPapersPage = useViewStore((s) => s.setPapersPage);
  const setShowArchive = useViewStore((s) => s.setShowArchive);
  const libraryChat = useViewStore((s) => s.libraryChat);
  const setLibraryChat = useViewStore((s) => s.setLibraryChat);
  const resetChat = useLibraryChatStore((s) => s.reset);
  const chatId = useLibraryChatStore((s) => s.chatId);
  const liveChatId = useLibraryChatStore((s) => s.liveChatId);
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const settingsPage = useViewStore((s) => s.settingsPage);
  const setSettingsPage = useViewStore((s) => s.setSettingsPage);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const peek = useUiStore((s) => s.sidebarPeek);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const shown = sidebarOpen || peek;
  // How the panel is laid out. It keeps its last look while sliding out, so
  // a docked panel leaves as the full-height strip it was, and a peeking one
  // as the small panel it was.
  const wanted = sidebarOpen ? "docked" : peek ? "floating" : null;
  const [shape, setShape] = useState<"docked" | "floating">(
    sidebarOpen ? "docked" : "floating",
  );
  if (wanted && wanted !== shape) setShape(wanted);

  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, ""),
    [articles, extra, slots],
  );
  const archived = articles.filter((a) => a.archived).length;
  const inboxCount = articles.filter((a) => a.inbox && !a.archived).length;
  const papers = articles.filter(
    (a) => isPdfUrl(a.canonicalUrl) && !a.archived,
  ).length;
  const named = spaces.filter((s) => s.id !== INBOX);

  return (
    // The slot is the sidebar's place in the row. Its width glides open and
    // shut while the panel slides in or out, so the page follows smoothly.
    <div
      className={cn(
        "relative z-30 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        sidebarOpen ? "w-52" : "w-0",
      )}
    >
      <nav
        aria-label="Collections"
        inert={!shown}
        onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
        onMouseLeave={() => peekSidebar(false)}
        className={cn(
          "bg-frame border-border text-ui absolute left-0 flex w-52 flex-col gap-0.5 overflow-y-auto px-2 pb-3 transition-[translate,box-shadow,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[translate]",
          // Docked: the full height of the window, with the contents a little
          // below the top. Floating (the hover peek): a small panel under the
          // top bar, which already starts below it.
          // (On macOS the window buttons sit above the contents.)
          shape === "docked"
            ? "top-0 bottom-0 border-r pt-2 [.platform-mac_&]:pt-8"
            : "top-11 bottom-2 left-2 rounded-xl border pt-2",
          // Shown, or slid out of sight (and out of reach of the keyboard).
          shown
            ? "translate-x-0"
            : "invisible -translate-x-[calc(100%+1rem)] shadow-none",
          shape === "floating" && shown && "shadow-[var(--shadow-float)]",
        )}
      >
        {shape === "docked" && (
          // The strip beside the macOS window buttons drags the window.
          <div
            data-tauri-drag-region
            aria-hidden
            className="absolute inset-x-0 top-0 hidden h-8 [.platform-mac_&]:block"
          />
        )}
        <Item
          on={
            !reading &&
            !showArchive &&
            !showInbox &&
            !papersPage &&
            !libraryChat &&
            !settingsPage
          }
          onClick={() => {
            setActive(INBOX);
            setSelected(null);
            leave();
          }}
          icon={<Home />}
        >
          Home
        </Item>
        <Item
          on={!reading && papersPage}
          onClick={() => {
            setPapersPage(true);
            setSelected(null);
            leave();
          }}
          icon={<FileText />}
          count={papers || undefined}
        >
          Papers
        </Item>
        {(inboxCount > 0 || showInbox) && (
          <Item
            on={!reading && showInbox}
            onClick={() => {
              setShowInbox(true);
              setSelected(null);
              leave();
            }}
            icon={<Inbox />}
            count={inboxCount}
          >
            Inbox
          </Item>
        )}

        <Label>Chats</Label>
        <Item
          on={
            !reading &&
            libraryChat &&
            (chatId === null || chatId === liveChatId)
          }
          onClick={() => {
            void resetChat();
            setLibraryChat(true);
            setSelected(null);
            leave();
          }}
          icon={<SquarePen />}
        >
          New chat
        </Item>
        <PreviousChats leave={leave} />

        <Label>Collections</Label>
        <Item on={false} onClick={() => setNaming(true)} icon={<Plus />}>
          New collection
        </Item>
        {naming && (
          // A new folder appears in the list, ready to be named.
          <FolderName
            label="New collection name"
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
          if (renaming === space.id) {
            return (
              <FolderName
                key={space.id}
                label={`Rename ${space.name}`}
                initial={space.name}
                onDone={(name) => {
                  setRenaming(null);
                  if (name)
                    void renameCollection(space.id, name).then(
                      (id) => id && setSelected(id),
                    );
                }}
              />
            );
          }
          return (
            <div key={space.id} className="group relative flex flex-col">
              {blogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleFolded(space.id)}
                  aria-label={`${open ? "Hide" : "Show"} the articles in ${space.name}`}
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
              <WithContextMenu
                items={[
                  {
                    label: "Rename",
                    onSelect: () => setRenaming(space.id),
                  },
                  {
                    label: "Delete",
                    onSelect: () => {
                      setSelected(space.id);
                      setConfirming(space.id);
                    },
                  },
                ]}
              >
                <Item
                  className={cn("pl-7", selected === space.id && "pr-14")}
                  on={selected === space.id}
                  onClick={() => {
                    // Clicking a collection opens or folds its articles and
                    // shows its options.
                    setSelected(space.id);
                    setConfirming(null);
                    if (blogs.length > 0) toggleFolded(space.id);
                  }}
                  onDoubleClick={() => setRenaming(space.id)}
                  icon={open ? <FolderOpen /> : <Folder />}
                  count={selected === space.id ? undefined : space.count}
                >
                  {space.name}
                </Item>
              </WithContextMenu>
              {selected === space.id && (
                <span className="absolute top-[3px] right-1 flex">
                  <IconButton
                    label={`Rename ${space.name}`}
                    size="sm"
                    onClick={() => setRenaming(space.id)}
                  >
                    <Pencil aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Delete ${space.name}`}
                    size="sm"
                    danger
                    onClick={() => setConfirming(space.id)}
                  >
                    <Trash2 aria-hidden />
                  </IconButton>
                </span>
              )}
              {confirming === space.id && (
                <Confirm
                  stacked
                  question={`Delete “${space.name}”?`}
                  note="Its articles are kept."
                  keepLabel="Cancel"
                  className="bg-accent/60 mx-1 mt-0.5 mb-1 rounded-md p-2"
                  onConfirm={(yes) => {
                    setConfirming(null);
                    if (!yes) return;
                    setSelected(null);
                    void removeCollection(space.id);
                  }}
                />
              )}
              {open && blogs.length > 0 && (
                <ul className="mt-0.5 mb-1 flex flex-col gap-px">
                  {blogs.map((a) => (
                    <li key={a.id}>
                      <WithContextMenu
                        items={[
                          {
                            label: "Open in new tab",
                            onSelect: () => openArticleInNewTab(a.id),
                          },
                        ]}
                      >
                        <button
                          type="button"
                          onClick={() => void openSavedArticle(a.id)}
                          title={a.title}
                          aria-current={readingId === a.id ? "page" : undefined}
                          className={cn(
                            "focus-visible:ring-ring/60 text-meta flex h-7 w-full items-center gap-2 rounded-md pr-2 pl-7 text-left outline-none focus-visible:ring-2",
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
                          <span className="min-w-0 flex-1 truncate">
                            {a.title}
                          </span>
                        </button>
                      </WithContextMenu>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {archived > 0 && (
          <>
            <div className="mt-4" />
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

        <div className="mt-auto flex flex-col gap-0.5 pt-4">
          {(agentStatus === "setup" || agentStatus === "off") && (
            <Item
              on={false}
              onClick={() => setSetupOpen(true)}
              icon={
                <i
                  aria-hidden
                  className="border-muted-foreground mx-[5px] !size-1.5 rounded-full border"
                />
              }
            >
              {agentStatus === "off" ? "Turn on an agent" : "Set up an agent"}
            </Item>
          )}
          <Item
            on={!reading && settingsPage}
            onClick={() => {
              setSettingsPage(true);
              setSelected(null);
              leave();
            }}
            icon={<SlidersHorizontal />}
          >
            Settings
          </Item>
        </div>
      </nav>
    </div>
  );
}

/** A small heading over a group of items. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-caption mt-5 mb-1 px-2.5 font-medium">
      {children}
    </h2>
  );
}

function Item({
  on,
  onClick,
  onDoubleClick,
  icon,
  count,
  className,
  children,
}: {
  className?: string;
  on: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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
        <span className="text-muted-foreground text-caption font-normal tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

/** A folder being named (a new one, or one being renamed): type the name,
 * Enter keeps it, Escape leaves it as it was. */
function FolderName({
  label,
  initial = "",
  onDone,
}: {
  label: string;
  initial?: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
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
        onFocus={(e) => e.currentTarget.select()}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name this collection"
        aria-label={label}
        maxLength={32}
        className="placeholder:text-muted-foreground text-ui min-w-0 flex-1 bg-transparent outline-none"
      />
    </form>
  );
}

/** The chats about the whole library you had before, newest first. Click one
 * to open it; the open one has a trash icon. */
function PreviousChats({ leave }: { leave: () => void }) {
  const allChats = useLibraryChatStore((s) => s.chats);
  const liveChatId = useLibraryChatStore((s) => s.liveChatId);
  // The chat you are in the middle of joins the list once you move on.
  const chats = allChats.filter((c) => c.id !== liveChatId);
  const chatId = useLibraryChatStore((s) => s.chatId);
  const openChat = useLibraryChatStore((s) => s.openChat);
  const deleteChat = useLibraryChatStore((s) => s.deleteChat);
  const libraryChat = useViewStore((s) => s.libraryChat);
  const setLibraryChat = useViewStore((s) => s.setLibraryChat);
  const reading = useReaderStore((s) => s.state.status === "ready");
  const [confirming, setConfirming] = useState<string | null>(null);
  // The whole section folds shut, like a collection does.
  const [folded, setFolded] = useState(
    () => readStorage(CHATS_FOLDED_KEY) === "1",
  );
  function toggleFolded() {
    setFolded(!folded);
    writeStorage(CHATS_FOLDED_KEY, folded ? "0" : "1");
  }

  const setAllChatsOpen = useUiStore((s) => s.setAllChatsOpen);
  const shown = chats.slice(0, RECENT_CHATS);

  return (
    <div className="mt-2 flex flex-col">
      <button
        type="button"
        onClick={toggleFolded}
        aria-expanded={!folded}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 text-ui mb-0.5 flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-left outline-none focus-visible:ring-2"
      >
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform duration-[var(--dur-fast)]",
            !folded && "rotate-90",
          )}
          aria-hidden
        />
        Previous chats
      </button>
      {!folded && chats.length === 0 && (
        <p className="text-muted-foreground text-ui px-2.5 py-1 leading-snug">
          Your chats will be listed here.
        </p>
      )}
      <ul className={cn("flex flex-col gap-px", folded && "hidden")}>
        {shown.map((chat) => {
          const open = !reading && libraryChat && chatId === chat.id;
          return (
            <li key={chat.id} className="relative">
              <WithContextMenu
                items={[
                  {
                    label: "Open in new tab",
                    onSelect: () => openChatInNewTab(chat.id),
                  },
                ]}
              >
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(null);
                    void openChat(chat.id);
                    setLibraryChat(true);
                    leave();
                  }}
                  title={chat.title}
                  aria-current={open ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/60 text-ui flex h-[30px] w-full items-center gap-2.5 rounded-md pr-8 pl-2.5 text-left outline-none focus-visible:ring-2",
                    open
                      ? "bg-accent text-foreground font-medium"
                      : "text-foreground/80 hover:bg-accent/70 hover:text-foreground",
                  )}
                >
                  <MessageCircle
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                </button>
              </WithContextMenu>
              {open && (
                <IconButton
                  label="Delete this chat"
                  size="sm"
                  danger
                  onClick={() => setConfirming(chat.id)}
                  className="absolute top-[3px] right-1"
                >
                  <Trash2 aria-hidden />
                </IconButton>
              )}
              {confirming === chat.id && (
                <Confirm
                  stacked
                  question="Delete this chat?"
                  keepLabel="Cancel"
                  className="bg-accent/60 mx-1 mt-0.5 mb-1 rounded-md p-2"
                  onConfirm={(yes) => {
                    setConfirming(null);
                    if (yes) void deleteChat(chat.id);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {!folded && chats.length > RECENT_CHATS && (
        <button
          type="button"
          onClick={() => setAllChatsOpen(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 text-ui mt-0.5 flex h-[30px] items-center gap-2.5 rounded-md pl-2.5 text-left outline-none focus-visible:ring-2"
        >
          <MoreHorizontal className="size-4 shrink-0" aria-hidden />
          View all
        </button>
      )}
    </div>
  );
}

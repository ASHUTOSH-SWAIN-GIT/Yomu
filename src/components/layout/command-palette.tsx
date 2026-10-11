import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  Archive,
  CornerDownRight,
  FileText,
  Focus,
  Image as ImageIcon,
  Inbox,
  Link as LinkIcon,
  Keyboard,
  MessageSquare,
  Library,
  Moon,
  Palette,
  PanelsTopLeft,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import { searchLibrary } from "@/lib/db";
import { logError } from "@/lib/log";
import { openLinkFromClipboard } from "@/lib/open-link";
import { pickAndOpenPdf } from "@/lib/pdf/pick";
import { openSampleArticle } from "@/lib/sample-article";
import { filterByQuery, matchesQuery } from "@/lib/palette";
import { resolveTheme } from "@/lib/appearance";
import {
  goToArchive,
  goToHome,
  goToInbox,
  goToPapers,
  goToSettings,
  openLibraryChat,
  startNewChat,
} from "@/lib/go";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SUMMARY_LABEL } from "@/lib/scope";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { openSavedArticle, showParagraph } from "@/lib/navigate";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useViewStore } from "@/stores/view-store";
import { activateTab, allBundles, openTab, useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui-store";
import type { SearchHit } from "@/types/library";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
const MATCH_START = "\u0001";
const MATCH_END = "\u0002";

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

/** The sections of the settings page, as the page's own links name them. */
const SETTINGS_SECTIONS = [
  { id: "reading", label: "Appearance and reading" },
  { id: "answers", label: "AI answers" },
  { id: "agent", label: "Agent" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "data", label: "Data" },
];

/** What a tab is showing, for the list of open tabs. */
function tabLabel(id: string): string {
  const bundle = allBundles().find((b) => b.id === id);
  const state = bundle?.parts.reader?.getState().state;
  if (state?.status === "ready") return state.article.title;
  if (bundle?.parts.view?.getState().libraryChat) return "Chat";
  return "Home";
}

/**
 * Cmd/Ctrl+K: the way to get anywhere in the app. It finds articles (by
 * title or full text), chats and their answers, goes to any page, settings
 * section, open tab or heading of the article being read, switches the
 * theme, and runs commands. With no query it lists recent articles and the
 * main places.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter={false}
      loop
      overlayClassName="fade-in fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px]"
      contentClassName="pop-in fixed top-[13vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-[var(--shadow-float)] outline-none"
    >
      {/* Mounted only while open, so the query and results reset on close. */}
      <PaletteBody close={() => setOpen(false)} />
    </Command.Dialog>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const articles = useLibraryStore((s) => s.articles);
  const reader = useReaderStore((s) => s.state);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const chats = useLibraryChatStore((s) => s.chats);
  const tabIds = useTabsStore((s) => s.ids);
  const activeTab = useTabsStore((s) => s.activeId);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  // Debounced full-text search over article text and chats.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchLibrary(q)
        .then((found) => !cancelled && setHits(found))
        .catch((err) => logError("palette search failed", err));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const byId = useMemo(
    () => new Map(articles.map((a) => [a.id, a])),
    [articles],
  );

  function openArticle(id: string) {
    void openSavedArticle(id);
    close();
  }

  const openArticle_ = reader.status === "ready" ? reader.article : null;
  const ui = useUiStore.getState;
  const dark =
    resolveTheme(
      theme,
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    ).mode === "dark";
  const inboxCount = articles.filter((a) => a.inbox && !a.archived).length;
  const archivedCount = articles.filter((a) => a.archived).length;

  // Places to go.
  const places: Action[] = [
    {
      id: "home",
      label: "Go to Home",
      icon: <Library />,
      shortcut: `${MOD}⇧H`,
      run: goToHome,
    },
    {
      id: "papers",
      label: "Go to Papers",
      icon: <FileText />,
      run: goToPapers,
    },
    ...(inboxCount > 0
      ? [
          {
            id: "inbox",
            label: `Go to Inbox (${inboxCount})`,
            icon: <Inbox />,
            run: goToInbox,
          },
        ]
      : []),
    ...(archivedCount > 0
      ? [
          {
            id: "archive",
            label: "Go to Archive",
            icon: <Archive />,
            run: goToArchive,
          },
        ]
      : []),
    {
      id: "new-chat",
      label: "New chat with your library",
      icon: <MessageSquare />,
      shortcut: `${MOD}N`,
      run: startNewChat,
    },
    {
      id: "settings",
      label: "Open settings",
      icon: <SlidersHorizontal />,
      shortcut: `${MOD},`,
      run: () => goToSettings(),
    },
    ...SETTINGS_SECTIONS.map((s) => ({
      id: `settings-${s.id}`,
      label: `Settings: ${s.label}`,
      icon: <SlidersHorizontal />,
      run: () => goToSettings(s.id),
    })),
    ...(tabIds.length > 1
      ? tabIds
          .filter((id) => id !== activeTab)
          .map((id) => ({
            id: `tab-${id}`,
            label: `Switch to tab: ${tabLabel(id)}`,
            icon: <PanelsTopLeft />,
            run: () => activateTab(id),
          }))
      : []),
  ];

  const actions: Action[] = [
    {
      id: "paste-link",
      label: "Open link from clipboard",
      icon: <LinkIcon />,
      shortcut: `${MOD}⇧V`,
      run: () => void openLinkFromClipboard(),
    },
    {
      id: "open-pdf",
      label: "Open a PDF…",
      icon: <FileText />,
      shortcut: `${MOD}O`,
      run: () => void pickAndOpenPdf(),
    },
    ...(openArticle_
      ? [
          {
            id: "summarize",
            label: "Summarize this article",
            icon: <Sparkles />,
            run: () =>
              void useChatStore
                .getState()
                .askArticle(openArticle_, SUMMARY_LABEL),
          },
        ]
      : []),
    {
      id: "tour",
      label: "Open the tour",
      icon: <Sparkles />,
      run: () => void openSampleArticle(),
    },
    {
      id: "focus",
      label: "Toggle focus mode",
      icon: <Focus />,
      shortcut: `${MOD}.`,
      run: () => ui().setFocusMode(!ui().focusMode),
    },
    {
      id: "chat",
      label: "Show or hide the chat",
      icon: <MessageSquare />,
      shortcut: `${MOD}E`,
      run: () =>
        useViewStore.getState().setChatOpen(!useViewStore.getState().chatOpen),
    },
    {
      id: "new-tab",
      label: "New tab",
      icon: <Plus />,
      shortcut: `${MOD}T`,
      run: () => openTab(),
    },
    {
      id: "theme-toggle",
      label: dark ? "Switch to the light theme" : "Switch to the dark theme",
      icon: dark ? <Sun /> : <Moon />,
      run: () =>
        setTheme(
          resolveTheme(
            theme,
            window.matchMedia("(prefers-color-scheme: dark)").matches,
          ).pair,
        ),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: <Keyboard />,
      shortcut: `${MOD}/`,
      run: () => ui().setShortcutsOpen(true),
    },
    {
      id: "images",
      label: ui().blockRemoteImages
        ? "Load remote images"
        : "Block remote images",
      icon: <ImageIcon />,
      run: () => ui().setBlockRemoteImages(!ui().blockRemoteImages),
    },
  ];
  // The individual settings sections only show once you search for them.
  const shownPlaces = query.trim()
    ? filterByQuery(places, query, (a) => a.label)
    : places.filter((p) => !p.id.startsWith("settings-"));
  const shownActions = filterByQuery(actions, query, (a) => a.label);

  // Chats: the newest few, or the ones whose title matches.
  const shownChats = (
    query.trim()
      ? chats.filter((c) => matchesQuery(c.title, query))
      : chats.slice(0, 3)
  ).slice(0, 6);

  // Headings of the article being read, to jump to.
  const headings = (openArticle_?.blocks ?? []).flatMap((b, index) =>
    b.type === "heading" ? [{ index, text: b.text }] : [],
  );
  const shownHeadings = (
    query.trim()
      ? headings.filter((h) => matchesQuery(h.text, query))
      : headings
  ).slice(0, query.trim() ? 20 : 6);

  // Themes only show once you search, so they don't crowd the empty list.
  const shownThemes = query.trim()
    ? THEMES.filter((t) => matchesQuery(`theme ${t.label}`, query)).slice(0, 6)
    : [];

  // Titles match as you type; full-text hits (below) add to them.
  const titleHits = query.trim()
    ? articles
        .filter((a) =>
          matchesQuery(`${a.title} ${a.site} ${a.author ?? ""}`, query),
        )
        .slice(0, 6)
    : [];

  // Results only count for the current query (they may lag a keystroke).
  const current = query.trim() ? hits : [];
  const titled = new Set(titleHits.map((a) => a.id));
  const articleHits = current.filter(
    (h) =>
      h.kind === "article" && byId.has(h.articleId) && !titled.has(h.articleId),
  );
  const chatHits = current.filter(
    (h) => h.kind === "chat" && byId.has(h.articleId),
  );

  const recent = [...articles]
    .filter((a) => !a.archived)
    .sort((a, b) => b.scrapedAt - a.scrapedAt)
    .slice(0, 5);

  const searching = query.trim().length > 0;

  return (
    <>
      <div className="border-border flex h-13 items-center gap-3 border-b px-4">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search, or go anywhere…"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-[0.9375rem] outline-none"
        />
        <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-px font-sans text-[0.6875rem]">
          esc
        </kbd>
      </div>

      <Command.List className="max-h-[min(24rem,55vh)] overflow-y-auto p-2">
        <Command.Empty className="text-muted-foreground px-4 py-10 text-center text-sm">
          Nothing found. Try fewer words.
        </Command.Empty>

        {!searching && (
          <Group label="Recent">
            {recent.map((a) => (
              <Row
                key={`recent-${a.id}`}
                value={`recent-${a.id}`}
                icon={<FileText />}
                onSelect={() => openArticle(a.id)}
              >
                <span className="truncate">{a.title}</span>
                <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                  {a.site}
                </span>
              </Row>
            ))}
          </Group>
        )}

        {titleHits.length > 0 && (
          <Group label="Articles">
            {titleHits.map((a) => (
              <Row
                key={`t-${a.id}`}
                value={`t-${a.id}`}
                icon={<FileText />}
                onSelect={() => openArticle(a.id)}
              >
                <span className="truncate">{a.title}</span>
                <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                  {a.site}
                </span>
              </Row>
            ))}
          </Group>
        )}

        {shownHeadings.length > 0 && (
          <Group label="In this article">
            {shownHeadings.map((h) => (
              <Row
                key={`h-${h.index}`}
                value={`h-${h.index}`}
                icon={<CornerDownRight />}
                onSelect={() => {
                  close();
                  showParagraph(h.index);
                }}
              >
                <span className="truncate">{h.text}</span>
              </Row>
            ))}
          </Group>
        )}

        {shownChats.length > 0 && (
          <Group label="Chats">
            {shownChats.map((c) => (
              <Row
                key={`chat-${c.id}`}
                value={`chat-${c.id}`}
                icon={<MessageSquare />}
                onSelect={() => {
                  openLibraryChat(c.id);
                  close();
                }}
              >
                <span className="truncate">{c.title}</span>
              </Row>
            ))}
          </Group>
        )}

        {shownPlaces.length > 0 && (
          <Group label="Go to">
            {shownPlaces.map((a) => (
              <Row
                key={a.id}
                value={`go-${a.id}`}
                icon={a.icon}
                onSelect={() => {
                  a.run();
                  close();
                }}
              >
                <span>{a.label}</span>
                {a.shortcut && (
                  <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-px font-sans text-[0.6875rem]">
                    {a.shortcut}
                  </kbd>
                )}
              </Row>
            ))}
          </Group>
        )}

        {shownThemes.length > 0 && (
          <Group label="Themes">
            {shownThemes.map((t) => (
              <Row
                key={`theme-${t.id}`}
                value={`theme-${t.id}`}
                icon={<Palette />}
                onSelect={() => {
                  setTheme(t.id);
                  close();
                }}
              >
                <span>Theme: {t.label}</span>
                {theme === t.id && (
                  <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                    current
                  </span>
                )}
              </Row>
            ))}
          </Group>
        )}

        {articleHits.length > 0 && (
          <Group label="Mentioned in articles">
            {articleHits.map((h) => (
              <Row
                key={`a-${h.articleId}`}
                value={`a-${h.articleId}`}
                icon={<FileText />}
                onSelect={() => openArticle(h.articleId)}
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {byId.get(h.articleId)?.title}
                  </span>
                  <span className="text-muted-foreground block truncate text-[0.6875rem]">
                    <Snippet text={h.snippet} />
                  </span>
                </span>
              </Row>
            ))}
          </Group>
        )}

        {chatHits.length > 0 && (
          <Group label="In your questions and answers">
            {chatHits.map((h) => (
              <Row
                key={`c-${h.articleId}`}
                value={`c-${h.articleId}`}
                icon={<MessageSquare />}
                onSelect={() => openArticle(h.articleId)}
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground block truncate text-[0.6875rem]">
                    <Snippet text={h.snippet} />
                  </span>
                  <span className="block truncate">
                    {byId.get(h.articleId)?.title}
                  </span>
                </span>
              </Row>
            ))}
          </Group>
        )}

        {shownActions.length > 0 && (
          <Group label="Commands">
            {shownActions.map((a) => (
              <Row
                key={a.id}
                value={`act-${a.id}`}
                icon={a.icon}
                onSelect={() => {
                  a.run();
                  close();
                }}
              >
                <span>{a.label}</span>
                {a.shortcut && (
                  <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-px font-sans text-[0.6875rem]">
                    {a.shortcut}
                  </kbd>
                )}
              </Row>
            ))}
          </Group>
        )}
      </Command.List>

      <div className="border-border text-muted-foreground bg-muted/60 flex gap-4 border-t px-4 py-2 text-[0.6875rem]">
        <span>↑↓ move</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group className="pb-1">
      <div className="text-muted-foreground px-2.5 pt-2.5 pb-1 text-[0.6875rem] font-medium">
        {label}
      </div>
      {children}
    </Command.Group>
  );
}

function Row({
  value,
  icon,
  onSelect,
  children,
}: {
  value: string;
  icon: React.ReactNode;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "relative flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-[0.8125rem] outline-none",
        "data-[selected=true]:bg-accent data-[selected=true]:[&>svg]:text-foreground",
        "[&>svg]:text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0",
      )}
    >
      {icon}
      {children}
    </Command.Item>
  );
}

/** Renders a full-text snippet, marking the matches. The markers are control
 * characters, not HTML, so article text can never inject markup. */
function Snippet({ text }: { text: string }) {
  const [lead, ...rest] = text.replace(/\s+/g, " ").split(MATCH_START);
  return (
    <>
      <span>{lead}</span>
      {rest.map((chunk, i) => {
        const [match, after] = chunk.split(MATCH_END);
        return (
          <span key={i}>
            <mark className="text-foreground rounded-sm bg-[var(--mark-active)] px-0.5">
              {match}
            </mark>
            {after}
          </span>
        );
      })}
    </>
  );
}

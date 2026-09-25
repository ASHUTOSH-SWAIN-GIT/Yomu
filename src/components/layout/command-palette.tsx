import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  FileText,
  Focus,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquare,
  MoonStar,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  SunMedium,
  Type,
} from "lucide-react";
import { searchLibrary } from "@/lib/db";
import { logError } from "@/lib/log";
import { openLinkFromClipboard } from "@/lib/open-link";
import { openSampleArticle } from "@/lib/sample-article";
import { filterByQuery } from "@/lib/palette";
import {
  INBOX,
  displaySpaceName,
  buildSpaces,
  spaceOfArticle,
} from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";
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

/**
 * Cmd/Ctrl+K: one place to find anything (articles, chat answers, spaces)
 * and to run commands. Search is full-text (see searchLibrary); with no
 * query it lists open tabs, recent articles and commands.
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
      overlayClassName="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px]"
      contentClassName="pop-in fixed top-[13vh] left-1/2 z-50 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[20px] border border-white/10 bg-[#16171c]/95 text-white shadow-[var(--shadow-float)] backdrop-blur-2xl outline-none"
    >
      {/* Mounted only while open, so the query and results reset on close. */}
      <PaletteBody close={() => setOpen(false)} />
    </Command.Dialog>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const articles = useLibraryStore((s) => s.articles);
  const tabs = useTabsStore((s) => s.tabs);
  const openArticleTab = useTabsStore((s) => s.openArticle);
  const newTab = useTabsStore((s) => s.newTab);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const reader = useReaderStore((s) => s.state);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

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
    const article = byId.get(id);
    if (article) setActive(spaceOfArticle(article, active));
    void openArticleTab(id);
    close();
  }

  const openArticleId = reader.status === "ready" ? reader.article : null;
  const ui = useUiStore.getState;
  const actions: Action[] = [
    {
      id: "new-tab",
      label: "New tab",
      icon: <Plus />,
      shortcut: `${MOD}T`,
      run: () => void newTab(),
    },
    {
      id: "paste-link",
      label: "Open link from clipboard",
      icon: <LinkIcon />,
      shortcut: `${MOD}⇧V`,
      run: () => void openLinkFromClipboard(),
    },
    ...(openArticleId
      ? [
          {
            id: "summarize",
            label: "Summarize this article",
            icon: <Sparkles />,
            run: () => void useChatStore.getState().summarize(openArticleId),
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
      id: "sidebar",
      label: "Show or hide spaces",
      icon: <PanelLeft />,
      shortcut: `${MOD}B`,
      run: () => ui().setSidebarOpen(!ui().sidebarOpen),
    },
    {
      id: "answer",
      label: "Show or hide the answer",
      icon: <MessageSquare />,
      shortcut: `${MOD}J`,
      run: () => ui().setAnswerOpen(!ui().answerOpen),
    },
    {
      id: "t-light",
      label: "Theme: Page",
      icon: <SunMedium />,
      run: () => ui().setTheme("light"),
    },
    {
      id: "t-paper",
      label: "Theme: Paper",
      icon: <Type />,
      run: () => ui().setTheme("paper"),
    },
    {
      id: "t-dark",
      label: "Theme: Night",
      icon: <MoonStar />,
      run: () => ui().setTheme("dark"),
    },
    {
      id: "t-auto",
      label: "Theme: Match system",
      icon: <SunMedium />,
      run: () => ui().setTheme("system"),
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
  const shownActions = filterByQuery(actions, query, (a) => a.label);

  const spaces = filterByQuery(
    buildSpaces(articles, extra, slots, active),
    query,
    (s) => s.name,
  ).filter(() => query.trim().length > 0);

  // Results only count for the current query (they may lag a keystroke).
  const current = query.trim() ? hits : [];
  const articleHits = current.filter(
    (h) => h.kind === "article" && byId.has(h.articleId),
  );
  const chatHits = current.filter(
    (h) => h.kind === "chat" && byId.has(h.articleId),
  );

  const recent = [...articles]
    .filter((a) => !a.archived)
    .sort((a, b) => b.scrapedAt - a.scrapedAt)
    .slice(0, 5);
  const openTabs = tabs
    .map((t) => (t.articleId ? byId.get(t.articleId) : undefined))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const searching = query.trim().length > 0;

  return (
    <>
      <div className="flex h-[62px] items-center gap-3 border-b border-white/10 px-5">
        <Search
          className="size-[1.125rem] shrink-0 text-white/55"
          aria-hidden
        />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search articles, chats and commands…"
          className="flex-1 bg-transparent text-[1.0625rem] text-white outline-none placeholder:text-white/45"
        />
        <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white/70">
          esc
        </kbd>
      </div>

      <Command.List className="max-h-[min(26rem,55vh)] overflow-y-auto p-2">
        <Command.Empty className="px-4 py-8 text-center text-sm text-white/55">
          Nothing found. Try fewer words.
        </Command.Empty>

        {!searching && openTabs.length > 0 && (
          <Group label="Open tabs">
            {openTabs.map((a) => (
              <Row
                key={`tab-${a.id}`}
                value={`tab-${a.id}`}
                icon={<FileText />}
                onSelect={() => openArticle(a.id)}
              >
                <span className="truncate">{a.title}</span>
                <span className="ml-auto text-xs text-white/50">{a.site}</span>
              </Row>
            ))}
          </Group>
        )}

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
                <span className="ml-auto text-xs text-white/50">{a.site}</span>
              </Row>
            ))}
          </Group>
        )}

        {articleHits.length > 0 && (
          <Group label="Articles">
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
                  <span className="block truncate text-xs text-white/55">
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
                  <span className="block truncate text-xs text-white/55">
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

        {spaces.length > 0 && (
          <Group label="Spaces">
            {spaces.map((s) => (
              <Row
                key={`s-${s.id}`}
                value={`s-${s.id}`}
                icon={
                  <span
                    aria-hidden
                    className="mx-0.5 size-3 rounded-[4px] ring-2 ring-white/40 ring-inset"
                  />
                }
                onSelect={() => {
                  setActive(s.id);
                  void newTab();
                  close();
                }}
              >
                <span>{s.id === INBOX ? "Inbox" : displaySpaceName(s.id)}</span>
                <span className="ml-auto text-xs text-white/50">{s.count}</span>
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
                  <kbd className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white/70">
                    {a.shortcut}
                  </kbd>
                )}
              </Row>
            ))}
          </Group>
        )}
      </Command.List>

      <div className="flex gap-4 border-t border-white/10 px-5 py-2.5 text-xs text-white/50">
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
      <div className="px-3 pt-2 pb-1 text-xs font-semibold text-white/50">
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
        "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[0.9375rem] text-white/90 outline-none",
        "data-[selected=true]:before:bg-space data-[selected=true]:bg-white/10 data-[selected=true]:before:absolute data-[selected=true]:before:top-2.5 data-[selected=true]:before:bottom-2.5 data-[selected=true]:before:left-0 data-[selected=true]:before:w-[3px] data-[selected=true]:before:rounded-full",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-white/55",
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
            <mark className="bg-space/45 rounded-[3px] px-0.5 text-white">
              {match}
            </mark>
            {after}
          </span>
        );
      })}
    </>
  );
}

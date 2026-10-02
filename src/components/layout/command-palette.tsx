import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  FileText,
  Focus,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageSquare,
  Library,
  Search,
  Sparkles,
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
      label: "Go to the library",
      icon: <Library />,
      shortcut: `${MOD}T`,
      run: () => void useTabsStore.getState().goHome(),
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
      id: "answer",
      label: "Show or hide the answer",
      icon: <MessageSquare />,
      shortcut: `${MOD}J`,
      run: () => ui().setAnswerOpen(!ui().answerOpen),
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
      <div className="border-border flex h-13 items-center gap-3 border-b px-4">
        <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search articles, chats and commands…"
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
                <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                  {a.site}
                </span>
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
                <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                  {a.site}
                </span>
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

        {spaces.length > 0 && (
          <Group label="Spaces">
            {spaces.map((s) => (
              <Row
                key={`s-${s.id}`}
                value={`s-${s.id}`}
                icon={
                  <span
                    aria-hidden
                    className="mx-[3px] size-2.5 rounded-full"
                    style={{
                      background:
                        s.slot === null
                          ? "var(--sp-inbox)"
                          : `var(--sp-${s.slot})`,
                    }}
                  />
                }
                onSelect={() => {
                  setActive(s.id);
                  void newTab();
                  close();
                }}
              >
                <span>{s.id === INBOX ? "Inbox" : displaySpaceName(s.id)}</span>
                <span className="text-muted-foreground ml-auto text-[0.6875rem]">
                  {s.count}
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

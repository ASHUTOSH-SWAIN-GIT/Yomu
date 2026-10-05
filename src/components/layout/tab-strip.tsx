import { useState } from "react";
import { FileText, Moon, PanelLeft, Plus, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

/** The window's title bar and the open tabs: square, flat tabs side by side
 * (like Notion's), the active one sharing the page's colour so it reads as
 * attached to it. Also the drag region, with room for the macOS controls. */
export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const activate = useTabsStore((s) => s.activate);
  const close = useTabsStore((s) => s.close);
  const newTab = useTabsStore((s) => s.newTab);
  const articles = useLibraryStore((s) => s.articles);

  const onHome = useReaderStore((s) => s.state.status !== "ready");
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const peekSidebar = useUiStore((s) => s.peekSidebar);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const articleOf = (articleId: string | null) =>
    articleId ? articles.find((a) => a.id === articleId) : undefined;
  const titleOf = (articleId: string | null) =>
    articleId ? (articleOf(articleId)?.title ?? "Article") : "Library";

  return (
    <div
      data-tauri-drag-region
      className="bg-frame border-border flex h-9 shrink-0 items-stretch border-b"
    >
      {onHome && (
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
          onMouseLeave={() => peekSidebar(false)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/50 focus-visible:ring-ring/60 grid w-9 shrink-0 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      )}
      <div role="tablist" className="flex min-w-0 items-stretch">
        {tabs.map((tab) => {
          const on = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={cn(
                "group border-border relative flex w-52 min-w-0 shrink items-center border-r text-[0.8125rem]",
                on
                  ? "bg-background text-foreground -mb-px"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => void activate(tab.id)}
                className="focus-visible:ring-ring/60 flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
              >
                <TabIcon url={articleOf(tab.articleId)?.canonicalUrl} />
                <span className="truncate">{titleOf(tab.articleId)}</span>
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={() => void close(tab.id)}
                  aria-label="Close tab"
                  className="hover:bg-accent text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mr-1.5 grid size-5 shrink-0 place-items-center rounded-sm opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void newTab()}
        aria-label="New tab"
        className="text-muted-foreground hover:text-foreground hover:bg-accent/50 focus-visible:ring-ring/60 grid w-9 shrink-0 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <Plus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label={dark ? "Use the light theme" : "Use the dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
        className="text-muted-foreground hover:text-foreground hover:bg-accent/50 focus-visible:ring-ring/60 ml-auto grid w-9 shrink-0 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </div>
  );
}

/** The site's own favicon for an article tab (the site was already contacted
 * to save the article), or a page icon for the library, when the favicon is
 * missing or remote images are blocked. */
function TabIcon({ url }: { url?: string }) {
  const blocked = useUiStore((s) => s.blockRemoteImages);
  const [failed, setFailed] = useState<string | null>(null);
  let src: string | null = null;
  try {
    if (url) src = new URL("/favicon.ico", url).href;
  } catch {
    // Not a valid URL: fall back to the page icon.
  }
  if (!src || blocked || failed === src)
    return <FileText className="size-3.5 shrink-0" aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="size-4 shrink-0 rounded-[3px] object-contain"
      onError={() => setFailed(src)}
    />
  );
}

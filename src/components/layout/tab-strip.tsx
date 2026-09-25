import { PanelLeft, Plus, X } from "lucide-react";
import { usesOverlayTitleBar } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { UpdateBanner } from "@/components/layout/update-banner";
import { ReaderSettings } from "@/components/reader/reader-settings";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore, type Tab } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

/** Open articles as tabs, plus the view controls. This strip is also the
 * window's title bar (drag region, and room for the macOS window controls
 * when the sidebar is closed). Only the active tab shows the space colour. */
export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const activate = useTabsStore((s) => s.activate);
  const close = useTabsStore((s) => s.close);
  const newTab = useTabsStore((s) => s.newTab);
  const articles = useLibraryStore((s) => s.articles);
  const reader = useReaderStore((s) => s.state);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const titleOf = (tab: Tab): string => {
    if (!tab.articleId) return "New tab";
    const found = articles.find((a) => a.id === tab.articleId);
    if (found) return found.title;
    return reader.status === "ready" && reader.article.id === tab.articleId
      ? reader.article.title
      : "Loading…";
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-end gap-1 pr-3"
      // With the sidebar closed, the window buttons overlap the strip.
      style={{
        paddingLeft:
          usesOverlayTitleBar() && !sidebarOpen ? "5.25rem" : "0.75rem",
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground mb-1 size-8"
        aria-label={sidebarOpen ? "Hide spaces" : "Show spaces"}
        aria-pressed={sidebarOpen}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <PanelLeft className="size-4" />
      </Button>

      <div
        role="tablist"
        aria-label="Open articles"
        className="flex min-w-0 items-end gap-1"
      >
        {tabs.map((tab) => {
          const on = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="presentation"
              className={cn(
                "group relative flex h-9 min-w-0 flex-[0_1_15.5rem] items-center rounded-t-xl text-[0.8125rem]",
                on
                  ? "bg-background text-foreground font-semibold shadow-[inset_0_2px_0_var(--space)]"
                  : "text-muted-foreground hover:bg-background/50 font-medium",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => void activate(tab.id)}
                onAuxClick={(e) => e.button === 1 && void close(tab.id)}
                title={titleOf(tab)}
                className="focus-visible:ring-ring/60 flex h-full min-w-0 flex-1 items-center gap-2 rounded-t-xl pr-8 pl-3 text-left outline-none focus-visible:ring-2"
              >
                <i
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-[3px]",
                    on ? "bg-space" : "bg-muted-foreground/50",
                  )}
                />
                <span className="truncate">{titleOf(tab)}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${titleOf(tab)}`}
                onClick={() => void close(tab.id)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 absolute right-1.5 rounded p-1 opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground mb-1 size-8 shrink-0"
        aria-label="New tab"
        onClick={() => void newTab()}
      >
        <Plus className="size-4" />
      </Button>

      <div data-tauri-drag-region className="min-w-4 flex-1 self-stretch" />

      <div className="mb-1 flex items-center gap-1">
        <UpdateBanner />
        <ReaderSettings />
      </div>
    </div>
  );
}

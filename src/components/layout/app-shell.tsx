import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/layout/command-palette";
import { LibrarySidebar } from "@/components/layout/library-sidebar";
import { ReaderView } from "@/components/layout/reader-view";
import { SetupDialog } from "@/components/layout/setup-dialog";
import { TabStrip } from "@/components/layout/tab-strip";
import { TopBar } from "@/components/layout/top-bar";
import { useSpaceAccent } from "@/hooks/use-space-accent";
import { useThemeEffect } from "@/hooks/use-theme";
import { openLinkFromClipboard } from "@/lib/open-link";
import { shortcutFor } from "@/lib/shortcuts";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

/**
 * The window: a tab strip across the top and, on the library page, the
 * spaces sidebar on the frame. What you read (the library or an article with
 * its margin notes) is a flat page beside it with its own top bar, the Ask
 * bar floating over it, plus the overlays (command palette, setup).
 */
export function AppShell() {
  useThemeEffect();
  useSpaceAccent();
  const focusMode = useUiStore((s) => s.focusMode);
  const onHome = useReaderStore((s) => s.state.status !== "ready");
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const articles = useLibraryStore((s) => s.articles);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const refreshAgent = useAgentStore((s) => s.refreshStatus);
  const syncSlots = useSpacesStore((s) => s.syncSlots);

  // Startup: load the library, restore last session's tabs, check Codex.
  useEffect(() => {
    void (async () => {
      await refreshLibrary();
      const ids = new Set(useLibraryStore.getState().articles.map((a) => a.id));
      await useTabsStore.getState().restore(ids);
    })();
    void refreshAgent();
  }, [refreshLibrary, refreshAgent]);

  // Every space (tag) keeps a stable colour.
  useEffect(() => {
    syncSlots([...new Set(articles.flatMap((a) => a.tags))]);
  }, [articles, syncSlots]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ui = useUiStore.getState();
      const tabs = useTabsStore.getState();

      if (e.key === "Escape" && ui.focusMode) return ui.setFocusMode(false);

      const command = shortcutFor(e);
      if (!command) return;
      e.preventDefault();

      if (command === "palette") ui.setPaletteOpen(!ui.paletteOpen);
      else if (command === "new-tab") void tabs.newTab();
      else if (command === "close-tab") void tabs.close(tabs.activeId);
      else if (command === "focus-ask") {
        if (useReaderStore.getState().state.status !== "ready") return;
        ui.setChatOpen(true);
        requestAnimationFrame(() =>
          document.getElementById("chat-input")?.focus(),
        );
      } else if (command === "focus-mode") ui.setFocusMode(!ui.focusMode);
      else if (command === "paste-link") void openLinkFromClipboard();
      else if (command.startsWith("tab-")) {
        const tab = tabs.tabs[Number(command.slice(4)) - 1];
        if (tab) void tabs.activate(tab.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="bg-frame text-foreground flex h-screen w-screen flex-col">
      {!focusMode && <TabStrip />}
      <div className="relative flex min-h-0 flex-1">
        {!focusMode && onHome && <LibrarySidebar />}
        {/* Where you read: the page, flat against the frame. The Ask bar
            floats over its bottom. */}
        <div className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!focusMode && <TopBar />}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ReaderView />
          </div>
        </div>
      </div>

      <CommandPalette />
      <SetupDialog />

      {focusMode && (
        // A thin hover zone along the top edge reveals the way out; it is
        // also reachable by keyboard (Tab) and Escape always works.
        <div className="group fixed inset-x-0 top-0 z-40 flex h-12 justify-center">
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 gap-2 opacity-0 shadow-md transition-opacity duration-[var(--dur)] group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => setFocusMode(false)}
          >
            Exit focus mode
            <kbd className="text-muted-foreground text-[0.6875rem]">Esc</kbd>
          </Button>
        </div>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { AllChatsDialog } from "@/components/layout/all-chats-dialog";
import { CommandPalette } from "@/components/layout/command-palette";
import { LibrarySidebar } from "@/components/layout/library-sidebar";
import { TabPages } from "@/components/layout/tab-pages";
import { ShortcutsDialog } from "@/components/layout/shortcuts-dialog";
import { WelcomeTour } from "@/components/layout/welcome-tour";
import { AgentConsentDialog } from "@/components/layout/agent-consent-dialog";
import { SetupDialog } from "@/components/layout/setup-dialog";
import { TopBar } from "@/components/layout/top-bar";
import { useSpaceAccent } from "@/hooks/use-space-accent";
import { useThemeEffect } from "@/hooks/use-theme";
import { OPEN_FIND } from "@/lib/find";
import { goHome } from "@/lib/navigate";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { logError } from "@/lib/log";
import { openLinkFromClipboard } from "@/lib/open-link";
import { openPdfs, pickAndOpenPdf } from "@/lib/pdf/pick";
import { shortcutFor } from "@/lib/shortcuts";
import { watchBookmarks } from "@/stores/bookmarks-store";
import { applyZoom, stepZoom } from "@/lib/zoom";
import { toast } from "@/stores/toast-store";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { closeTab, openTab, switchTab, useTabsStore } from "@/stores/tabs";
import { useUiStore } from "@/stores/ui-store";
import { useViewStore } from "@/stores/view-store";

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
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const articles = useLibraryStore((s) => s.articles);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const refreshAgent = useAgentStore((s) => s.refreshStatus);
  const syncSlots = useSpacesStore((s) => s.syncSlots);

  // Startup: load the library and check Codex.
  useEffect(() => {
    void refreshLibrary();
    void refreshAgent();
    void useLibraryChatStore.getState().loadChats();
  }, [refreshLibrary, refreshAgent]);

  // Every space (tag) keeps a stable colour.
  useEffect(() => {
    syncSlots([...new Set(articles.flatMap((a) => a.tags))]);
  }, [articles, syncSlots]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ui = useUiStore.getState();

      // In the app Esc only ever closes something. Left unhandled it would
      // also reach the window, and on macOS that takes a full screen window
      // out of full screen. (Dialogs and menus see it first, so they close.)
      if (e.key === "Escape" && !e.isComposing) e.preventDefault();
      if (e.key === "Escape" && ui.focusMode) return ui.setFocusMode(false);

      const command = shortcutFor(e);
      if (!command) return;
      e.preventDefault();

      if (command === "palette") ui.setPaletteOpen(!ui.paletteOpen);
      else if (command === "toggle-sidebar") ui.setSidebarOpen(!ui.sidebarOpen);
      else if (command === "focus-ask") {
        if (useReaderStore.getState().state.status !== "ready") return;
        useViewStore.getState().setChatOpen(true);
        // Every open tab has a chat box; the active tab's is the one marked.
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>('[data-tab-active="true"] #chat-input')
            ?.focus(),
        );
      } else if (command === "focus-mode") ui.setFocusMode(!ui.focusMode);
      else if (command === "paste-link") void openLinkFromClipboard();
      else if (command === "open-pdf") void pickAndOpenPdf();
      else if (command === "new-tab") openTab();
      else if (command === "close-tab")
        closeTab(useTabsStore.getState().activeId);
      else if (command === "next-tab") switchTab(1);
      else if (command === "prev-tab") switchTab(-1);
      else if (command === "shortcuts") ui.setShortcutsOpen(!ui.shortcutsOpen);
      else if (command === "find") {
        if (useReaderStore.getState().state.status === "ready")
          window.dispatchEvent(new Event(OPEN_FIND));
      } else if (command === "toggle-chat") {
        const view = useViewStore.getState();
        if (useReaderStore.getState().state.status === "ready")
          view.setChatOpen(!view.chatOpen);
      } else if (command === "home") {
        useViewStore.getState().showHome();
        void goHome();
      } else if (command === "new-chat") {
        void useLibraryChatStore.getState().reset();
        useViewStore.getState().setLibraryChat(true);
        if (useReaderStore.getState().state.status === "ready") void goHome();
      } else if (command === "settings") {
        const view = useViewStore.getState();
        view.setSettingsPage(!view.settingsPage);
        if (useReaderStore.getState().state.status === "ready") void goHome();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Pages bookmarked into a browser folder named Yomu are saved on their own,
  // including ones bookmarked while the app was closed.
  useEffect(() => watchBookmarks(), []);

  // A PDF dropped on the window opens like one chosen from the dialog.
  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        openPdfs(event.payload.paths);
      })
      .then((unlisten) => {
        if (gone) unlisten();
        else off = unlisten;
      })
      .catch((err) => logError("listening for dropped files failed", err));
    return () => {
      gone = true;
      off?.();
    };
  }, []);

  // Zoom the whole app: Cmd/Ctrl + and - step it, Cmd/Ctrl 0 resets it. The
  // level is saved, so the app opens at the same size next time.
  useEffect(() => {
    const { zoom } = useUiStore.getState();
    if (zoom !== 1) void applyZoom(zoom);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const { zoom: level, setZoom } = useUiStore.getState();
      const next =
        e.key === "=" || e.key === "+"
          ? stepZoom(level, 1)
          : e.key === "-" || e.key === "_"
            ? stepZoom(level, -1)
            : e.key === "0"
              ? 1
              : null;
      if (next === null) return;
      e.preventDefault();
      setZoom(next);
      toast(`Zoom ${Math.round(next * 100)}%`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bg-frame text-foreground flex h-screen w-screen flex-col">
      <div className="relative flex min-h-0 flex-1">
        {!focusMode && <LibrarySidebar />}
        {/* Where you read: the page, flat against the frame. The Ask bar
            floats over its bottom. */}
        <div className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!focusMode && <TopBar />}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TabPages />
          </div>
        </div>
      </div>

      <CommandPalette />
      <AllChatsDialog />
      <SetupDialog />
      <AgentConsentDialog />
      <ShortcutsDialog />
      <WelcomeTour />
      <Toaster />

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
            <kbd className="text-muted-foreground text-caption">Esc</kbd>
          </Button>
        </div>
      )}
    </div>
  );
}

import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibrarySidebar } from "@/components/layout/library-sidebar";
import { ReaderView } from "@/components/layout/reader-view";
import { ChatPanel } from "@/components/layout/chat-panel";
import { UpdateBanner } from "@/components/layout/update-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useUiStore } from "@/stores/ui-store";
import { useThemeEffect } from "@/hooks/use-theme";

export function AppShell() {
  useThemeEffect();
  const chatPanelOpen = useUiStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useUiStore((s) => s.setChatPanelOpen);

  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col">
      <header className="border-border flex h-10 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold tracking-tight">Yomu</span>
        <div className="flex items-center gap-2">
          <UpdateBanner />
          {!chatPanelOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Open explain panel"
              onClick={() => setChatPanelOpen(true)}
            >
              <PanelRightOpen className="size-4" />
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LibrarySidebar />
        <ReaderView />
        {chatPanelOpen && <ChatPanel />}
      </div>
    </div>
  );
}

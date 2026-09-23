import { MessageSquare, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

export function ChatPanel() {
  const toggleChatPanel = useUiStore((s) => s.toggleChatPanel);

  return (
    <aside className="border-border bg-muted/20 flex h-full w-80 shrink-0 flex-col border-l">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="text-muted-foreground size-4" />
          Explain
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Collapse panel"
          onClick={toggleChatPanel}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <p>Select text in the reader</p>
        <p className="text-xs">Your agent's explanation appears here.</p>
      </div>
    </aside>
  );
}

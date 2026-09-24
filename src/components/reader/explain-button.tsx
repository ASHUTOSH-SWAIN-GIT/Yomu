import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReaderSelection } from "@/hooks/use-text-selection";

const SHORTCUT = /Mac/.test(navigator.platform) ? "⌘E" : "Ctrl+E";

export function ExplainButton({
  anchor,
  disabled,
  onExplain,
}: {
  anchor: ReaderSelection;
  disabled: boolean;
  onExplain: () => void;
}) {
  return (
    <Button
      size="sm"
      disabled={disabled}
      // Keep the selection alive: a normal mousedown would collapse it
      // before the click handler runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onExplain}
      style={{
        position: "fixed",
        top: anchor.rect.bottom + 8,
        left: Math.max(8, anchor.rect.left),
      }}
      className="z-50 shadow-md"
    >
      <Sparkles className="size-3.5" />
      Explain
      <kbd className="text-[10px] opacity-70">{SHORTCUT}</kbd>
    </Button>
  );
}

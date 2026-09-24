import { Image, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

export function ImagePrivacyToggle() {
  const blocked = useUiStore((s) => s.blockRemoteImages);
  const setBlocked = useUiStore((s) => s.setBlockRemoteImages);

  return (
    <Button
      variant={blocked ? "secondary" : "ghost"}
      size="icon"
      className="size-7"
      aria-label="Block remote images"
      aria-pressed={blocked}
      title={
        blocked
          ? "Remote images are blocked. Click to load them."
          : "Block remote images (stops trackers)"
      }
      onClick={() => setBlocked(!blocked)}
    >
      {blocked ? (
        <ImageOff className="size-3.5" />
      ) : (
        <Image className="size-3.5" />
      )}
    </Button>
  );
}

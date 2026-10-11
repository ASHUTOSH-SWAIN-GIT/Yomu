import { RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { REPLY_ACTION } from "@/components/chat/reply-action";

/** Asks for a fresh answer to the last question; shows on hover of its
 * `group` row, next to the copy button. */
export function RegenerateButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      label="Answer again"
      size="md"
      onClick={onClick}
      className={REPLY_ACTION}
    >
      <RefreshCw aria-hidden />
    </IconButton>
  );
}

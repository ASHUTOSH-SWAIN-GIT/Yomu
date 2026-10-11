import { MessageSquareText } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { REPLY_ACTION } from "@/components/chat/reply-action";

/** Keeps an answer about some words as a comment beside them; shows on hover
 * of its `group` row, next to the copy button. */
export function SaveAnswerButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      label="Save as a comment on those words"
      size="md"
      onClick={onClick}
      className={REPLY_ACTION}
    >
      <MessageSquareText aria-hidden />
    </IconButton>
  );
}

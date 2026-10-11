import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { REPLY_ACTION } from "@/components/chat/reply-action";

/** Copies a reply; shows on hover of its `group` row. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? "Copied" : "Copy reply"}
      size="md"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={REPLY_ACTION}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </IconButton>
  );
}

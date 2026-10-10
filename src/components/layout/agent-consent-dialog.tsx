import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { agentSandboxed } from "@/lib/commands";
import { agentLabel } from "@/lib/agents";
import { useAgentStore } from "@/stores/agent-store";

/** What turning on an agent means. Nothing is started, or even looked for,
 * until the user agrees here. */
export function AgentConsentDialog() {
  const asking = useAgentStore((s) => s.asking);
  const cancel = useAgentStore((s) => s.cancelAsk);
  const enable = useAgentStore((s) => s.enable);
  // False where the agent cannot be fenced in (Windows, an old Linux kernel).
  const [sandboxed, setSandboxed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!asking) return;
    agentSandboxed()
      .then(setSandboxed)
      .catch(() => setSandboxed(null));
  }, [asking]);

  const name = asking ? agentLabel(asking) : "";
  return (
    <Dialog open={!!asking} onOpenChange={(open) => !open && cancel()}>
      <DialogContent>
        <DialogTitle>Turn on {name}?</DialogTitle>
        <DialogDescription className="sr-only">
          What happens when Yomu uses {name}.
        </DialogDescription>
        <ul className="text-muted-foreground list-disc space-y-2 pl-4 text-[0.8125rem]">
          <li>
            Yomu starts it on this computer and sends it your questions, the
            words you select and the blog text it needs to answer.
          </li>
          <li>
            It is not made by Yomu. Its sign-in, usage limits and what it does
            with your data are set by its own provider.
          </li>
          <li>
            {sandboxed === false
              ? "This computer can't fence it in, so it runs with your own permissions."
              : "It runs fenced in: it can read your files but not change them. Anything beyond reading Yomu's library or a web page is refused."}
          </li>
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="rounded-lg" onClick={cancel}>
            Cancel
          </Button>
          <Button
            className="rounded-lg"
            onClick={() => asking && void enable(asking)}
          >
            Turn on
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

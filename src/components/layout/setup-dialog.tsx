import { useEffect } from "react";
import { SetupChecklist } from "@/components/chat/setup-checklist";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentStore } from "@/stores/agent-store";
import { useUiStore } from "@/stores/ui-store";

/** The Codex setup checklist as a dialog, opened from the Ask bar or the
 * sidebar status. Closes itself once everything is set up. */
export function SetupDialog() {
  const open = useUiStore((s) => s.setupOpen);
  const setOpen = useUiStore((s) => s.setSetupOpen);
  const status = useAgentStore((s) => s.status);
  const refresh = useAgentStore((s) => s.refreshStatus);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  useEffect(() => {
    if (open && status === "ready") setOpen(false);
  }, [open, status, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle className="sr-only">Set up Explain</DialogTitle>
        <DialogDescription className="sr-only">
          Install Codex and sign in to ask questions about what you read.
        </DialogDescription>
        <SetupChecklist />
      </DialogContent>
    </Dialog>
  );
}

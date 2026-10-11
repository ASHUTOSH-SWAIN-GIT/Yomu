import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useToastStore } from "@/stores/toast-store";

/** Where toasts appear: bottom centre, over everything, read out politely. */
export function Toaster() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          className="rise-in bg-popover text-popover-foreground text-ui pointer-events-auto flex max-w-md items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-4 shadow-[var(--shadow-float)]"
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                dismiss();
              }}
              className="hover:bg-accent focus-visible:ring-ring/60 h-7 shrink-0 rounded-md px-2.5 font-medium outline-none focus-visible:ring-2"
            >
              {toast.action.label}
            </button>
          )}
          <IconButton label="Dismiss" size="md" onClick={dismiss}>
            <X aria-hidden />
          </IconButton>
        </div>
      )}
    </div>
  );
}

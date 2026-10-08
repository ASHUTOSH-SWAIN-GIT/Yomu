import type { ChatError } from "@/lib/chat-errors";
import { useUiStore } from "@/stores/ui-store";

/** What went wrong in a chat, with the one button that fixes it: set the
 * agent up, drop a model the plan cannot use, or just try again. */
export function ErrorNote({
  error,
  onRetry,
}: {
  error: ChatError;
  onRetry: () => Promise<void>;
}) {
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const setChatModel = useUiStore((s) => s.setChatModel);

  const fix =
    error.kind === "logged_out" || error.kind === "adapter_missing"
      ? { label: "Open setup", run: () => setSetupOpen(true) }
      : error.kind === "model_unavailable"
        ? {
            label: "Use Auto and try again",
            run: () => {
              setChatModel(null);
              void onRetry();
            },
          }
        : { label: "Try again", run: () => void onRetry() };

  return (
    <div
      role="alert"
      className="text-destructive border-destructive/40 mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-[0.8125rem]"
    >
      {error.message}
      <button
        type="button"
        onClick={fix.run}
        className="self-start font-medium underline underline-offset-2"
      >
        {fix.label}
      </button>
    </div>
  );
}

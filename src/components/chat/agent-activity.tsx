import { useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { hasProgress, type Progress } from "@/lib/agent-progress";
import { cn } from "@/lib/utils";

/** What the agent is doing while it works: one quiet line ("Searching the
 * library…") that opens to its thinking and the steps it took. Shown only
 * while the turn runs, and only if the agent reports anything. */
export function AgentActivity({
  progress,
  finished = false,
}: {
  progress: Progress;
  /** The turn is over: say what was done, not what is being done. */
  finished?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!hasProgress(progress)) return null;

  const running = [...progress.steps]
    .reverse()
    .find((s) => s.status === "pending" || s.status === "in_progress");
  const label = finished
    ? progress.steps.length > 0
      ? `Used ${progress.steps.length} ${progress.steps.length === 1 ? "tool" : "tools"}`
      : "Thought it through"
    : running
      ? `${running.title}…`
      : "Thinking…";

  return (
    <div className="text-muted-foreground py-1 text-[0.8125rem]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:text-foreground focus-visible:ring-ring/60 flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2"
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        {label}
        {!finished && progress.steps.length > 0 && (
          <span className="text-muted-foreground/70">
            · {progress.steps.length}{" "}
            {progress.steps.length === 1 ? "step" : "steps"}
          </span>
        )}
      </button>
      {open && (
        <div className="border-border mt-1.5 ml-1.5 flex flex-col gap-2 border-l pl-3.5">
          {progress.thinking && (
            <p className="max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap">
              {progress.thinking.trim()}
            </p>
          )}
          {progress.steps.length > 0 && (
            <ul className="flex flex-col gap-1">
              {progress.steps.map((step) => (
                <li key={step.id} className="flex items-center gap-2">
                  {step.status === "completed" ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : finished && step.status !== "failed" ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : step.status === "failed" ? (
                    <span className="text-destructive size-3.5 shrink-0 text-center leading-none">
                      ×
                    </span>
                  ) : (
                    <Loader2
                      className="size-3.5 shrink-0 animate-spin"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 truncate">{step.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

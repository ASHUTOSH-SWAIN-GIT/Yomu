import { presetOf } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useUiStore } from "@/stores/ui-store";

/** Which agent answers, and whether it is ready, working or needs setting
 * up. Clicking it when it needs setting up opens the setup. */
export function AgentPill({ working }: { working: boolean }) {
  const config = useAgentStore((s) => s.config);
  const status = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);

  const name =
    config.kind === "codex"
      ? "Codex"
      : (presetOf(config)?.label ?? config.command.split("/").pop() ?? "Agent");
  const needsSetup = status === "setup";
  const state = needsSetup
    ? "Needs setup"
    : status === "checking"
      ? "Starting…"
      : working
        ? "Working…"
        : "Ready";

  return (
    <button
      type="button"
      disabled={!needsSetup}
      onClick={() => setSetupOpen(true)}
      title={needsSetup ? "Set up the agent" : `${name}: ${state}`}
      className="text-muted-foreground enabled:hover:text-foreground focus-visible:ring-ring/60 flex shrink-0 items-center gap-1.5 rounded-full text-[0.6875rem] font-normal outline-none focus-visible:ring-2"
    >
      <i
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          needsSetup ? "border-muted-foreground border" : "bg-muted-foreground",
          (working || status === "checking") && "animate-pulse",
        )}
      />
      {name} · {state}
    </button>
  );
}

import { useEffect, useState } from "react";
import { Check, Circle, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/log";
import { setupSteps, type SetupStep } from "@/lib/setup";
import { useAgentStore } from "@/stores/agent-store";

/** First-run setup: what's missing, how to fix it, and a re-check that
 * also runs when the window regains focus (the user installs in a
 * terminal, then comes back). */
export function SetupChecklist() {
  const diagnosis = useAgentStore((s) => s.diagnosis);
  const refresh = useAgentStore((s) => s.refreshStatus);
  const login = useAgentStore((s) => s.login);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  async function recheck() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  if (!diagnosis) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin" aria-label="Checking setup" />
      </div>
    );
  }

  const steps = setupSteps(diagnosis);
  const current = steps.find((s) => !s.done)?.id;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <div>
        <h2 className="text-sm font-medium">Set up Explain</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Yomu uses the Codex CLI on your machine, billed to your ChatGPT plan.
          Reading works without it.
        </p>
      </div>

      <ol className="flex flex-col gap-3" aria-label="Setup steps">
        {steps.map((step) => (
          <li
            key={step.id}
            aria-current={step.id === current ? "step" : undefined}
            className="flex gap-2.5"
          >
            <StepMark done={step.done} current={step.id === current} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {step.title}
                <span className="sr-only">
                  {step.done ? " (done)" : " (to do)"}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">{step.detail}</p>
              {!step.done && step.command && (
                <CommandLine command={step.command} />
              )}
              {!step.done && step.id === "login" && step.actionable && (
                <Button size="sm" className="mt-2" onClick={() => void login()}>
                  Sign in with ChatGPT
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={checking}
        onClick={() => void recheck()}
      >
        {checking && <Loader2 className="size-3.5 animate-spin" />}
        Check again
      </Button>
    </div>
  );
}

function StepMark({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="size-3" aria-hidden />
      </span>
    );
  }
  return (
    <Circle
      aria-hidden
      className={
        current
          ? "text-foreground mt-0.5 size-4 shrink-0"
          : "text-muted-foreground mt-0.5 size-4 shrink-0"
      }
    />
  );
}

function CommandLine({ command }: { command: SetupStep["command"] & string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logError("copy failed", err);
    }
  }

  return (
    <div className="bg-muted mt-1.5 flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
      <code className="min-w-0 truncate font-mono text-xs">{command}</code>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label={copied ? "Copied" : `Copy command: ${command}`}
        onClick={() => void copy()}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

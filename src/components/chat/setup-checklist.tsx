import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
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
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
      <div>
        <h2 className="font-display text-[1.25rem] font-medium tracking-[-0.01em]">
          Set up Explain
        </h2>
        <p className="text-muted-foreground mt-1 text-[0.75rem] leading-relaxed">
          Answers come from Codex on your own computer, using your ChatGPT plan.
          Reading works without it.
        </p>
      </div>

      <ol className="flex flex-col" aria-label="Setup steps">
        {steps.map((step, i) => (
          <li
            key={step.id}
            aria-current={step.id === current ? "step" : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="bg-border absolute top-6 bottom-1 left-[9px] w-px"
              />
            )}
            <StepMark
              n={i + 1}
              done={step.done}
              current={step.id === current}
            />
            <div className="min-w-0 flex-1">
              <p
                className={
                  step.done || step.id === current
                    ? "text-[0.8125rem] font-medium"
                    : "text-muted-foreground text-[0.8125rem] font-medium"
                }
              >
                {step.title}
                <span className="sr-only">
                  {step.done ? " (done)" : " (to do)"}
                </span>
              </p>
              <p className="text-muted-foreground mt-0.5 text-[0.75rem]">
                {step.detail}
              </p>
              {!step.done && step.command && (
                <CommandLine command={step.command} />
              )}
              {!step.done && step.id === "login" && step.actionable && (
                <Button
                  size="sm"
                  className="mt-2.5 h-8 text-[0.75rem]"
                  onClick={() => void login()}
                >
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
        className="border-border h-8 self-start text-[0.75rem]"
        disabled={checking}
        onClick={() => void recheck()}
      >
        {checking && <Loader2 className="size-3.5 animate-spin" />}
        Check again
      </Button>
    </div>
  );
}

/** Done steps are filled white with a check; the current one is outlined
 * in white; later ones are quiet. */
function StepMark({
  n,
  done,
  current,
}: {
  n: number;
  done: boolean;
  current: boolean;
}) {
  return (
    <span
      aria-hidden
      className={
        "grid size-[19px] shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold tabular-nums " +
        (done
          ? "bg-foreground text-background"
          : current
            ? "text-foreground ring-foreground ring-1"
            : "text-muted-foreground ring-border ring-1")
      }
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : n}
    </span>
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
    <div className="border-border mt-2 flex items-center justify-between gap-2 rounded-md border py-1 pr-1 pl-2.5">
      <code className="min-w-0 truncate font-mono text-[0.72rem]">
        {command}
      </code>
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

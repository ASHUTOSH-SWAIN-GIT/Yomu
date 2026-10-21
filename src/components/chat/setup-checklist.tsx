import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presetOf, type AgentPreset } from "@/lib/agents";
import { logError } from "@/lib/log";
import { setupSteps, type SetupStep } from "@/lib/setup";
import { useAgentStore } from "@/stores/agent-store";

/** Setup: what's missing for the agent in use, how to fix it, and a
 * re-check that also runs when the window regains focus (the reader
 * installs in a terminal, then comes back). Codex has a live checklist of
 * its own; any other agent shows the steps its preset brings. */
export function SetupChecklist() {
  const preset = useAgentStore((s) => presetOf(s.config));
  return preset ? <PresetChecklist preset={preset} /> : <CodexChecklist />;
}

function CodexChecklist() {
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

  if (!diagnosis) return <Checking />;

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
      <Heading
        title="Set up an agent"
        note="Answers come from Codex on your own computer, using your ChatGPT plan. Reading works without it."
      />
      <StepList
        steps={setupSteps(diagnosis)}
        extra={(step) =>
          !step.done && step.id === "login" && step.actionable ? (
            <Button
              size="sm"
              className="text-meta mt-2.5 h-8"
              onClick={() => void login()}
            >
              Sign in with ChatGPT
            </Button>
          ) : null
        }
      />
      <CheckAgain checking={checking} onClick={() => void recheck()} />
    </div>
  );
}

/** What an agent Yomu knows how to start needs before it will answer: what
 * its preset says to do, and what the last attempt to start it said. There
 * is no live checklist for these — only Codex reports enough to build one —
 * but the reader still gets the reason it did not start. */
function PresetChecklist({ preset }: { preset: AgentPreset }) {
  const refresh = useAgentStore((s) => s.refreshStatus);
  const error = useAgentStore((s) => s.customError);
  const [checking, setChecking] = useState(false);

  async function recheck() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
      <Heading title={`Set up ${preset.label}`} note={preset.note} />
      <p className="text-muted-foreground text-meta leading-relaxed">
        {preset.missing}
      </p>
      {error && (
        <p role="alert" className="text-destructive text-meta break-words">
          {error}
        </p>
      )}
      <CheckAgain checking={checking} onClick={() => void recheck()} />
    </div>
  );
}

function CheckAgain({
  checking,
  onClick,
}: {
  checking: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="border-border text-meta h-8 self-start"
      disabled={checking}
      onClick={onClick}
    >
      {checking && <Loader2 className="size-3.5 animate-spin" />}
      Check again
    </Button>
  );
}

function Heading({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="font-display text-title font-medium tracking-[-0.01em]">
        {title}
      </h2>
      <p className="text-muted-foreground text-meta mt-1 leading-relaxed">
        {note}
      </p>
    </div>
  );
}

function Checking() {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center">
      <Loader2 className="size-4 animate-spin" aria-label="Checking setup" />
    </div>
  );
}

/** The steps as a numbered list; the current one is the first that is not
 * done. `extra` lets the caller add its own control under a step. */
function StepList({
  steps,
  extra,
}: {
  steps: SetupStep[];
  extra?: (step: SetupStep) => React.ReactNode;
}) {
  const current = steps.find((s) => !s.done)?.id;

  return (
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
          <StepMark n={i + 1} done={step.done} current={step.id === current} />
          <div className="min-w-0 flex-1">
            <p
              className={
                step.done || step.id === current
                  ? "text-ui font-medium"
                  : "text-muted-foreground text-ui font-medium"
              }
            >
              {step.title}
              <span className="sr-only">
                {step.done ? " (done)" : " (to do)"}
              </span>
            </p>
            <p className="text-muted-foreground text-meta mt-0.5">
              {step.detail}
            </p>
            {!step.done && step.command && (
              <CommandLine command={step.command} />
            )}
            {extra?.(step)}
          </div>
        </li>
      ))}
    </ol>
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
        "text-caption grid size-[19px] shrink-0 place-items-center rounded-full font-semibold tabular-nums " +
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
      <code className="text-caption min-w-0 truncate font-mono">{command}</code>
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

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { AgentConfig } from "@/types/agent";
import { Button } from "@/components/ui/button";
import { Setting } from "@/components/settings/controls";
import { Segmented } from "@/components/ui/segmented";
import { type CommandCodePlan } from "@/lib/command-code-plan";
import { agentFindCommand, agentSandboxed } from "@/lib/commands";
import {
  CODEX_DETECT,
  CODEX_ID,
  PRESETS,
  agentId,
  presetOf,
} from "@/lib/agents";
import { joinWords, splitWords } from "@/lib/shell-words";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";

/** Which agent Yomu talks to: Codex, one of the presets (Claude Code,
 * OpenCode), or any program that speaks ACP over stdio. */
export function AgentSection() {
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const commandCodePlan = useUiStore((s) => s.commandCodePlan);
  const setCommandCodePlan = useUiStore((s) => s.setCommandCodePlan);
  const setSettingsPage = useViewStore((s) => s.setSettingsPage);
  const config = useAgentStore((s) => s.config);
  const status = useAgentStore((s) => s.status);
  const customError = useAgentStore((s) => s.customError);
  const setConfig = useAgentStore((s) => s.setConfig);
  const refresh = useAgentStore((s) => s.refreshStatus);
  const enabled = useAgentStore((s) => s.enabled);
  const ask = useAgentStore((s) => s.ask);

  const custom = config.kind === "custom" ? config : null;
  const [command, setCommand] = useState(custom?.command ?? "");
  const [args, setArgs] = useState(custom ? joinWords(custom.args) : "");
  const [dataDirs, setDataDirs] = useState(custom?.dataDirs.join(", ") ?? "");
  // Where each agent's program was found (by preset id, and Codex under
  // `CODEX_ID`); null if missing. Only installed agents are offered.
  const [installed, setInstalled] = useState<Record<string, string | null>>({});
  const [found, setFound] = useState<string | null | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  // False where the agent cannot be fenced in (Windows, an old Linux kernel).
  const [sandboxed, setSandboxed] = useState<boolean | null>(null);
  useEffect(() => {
    agentSandboxed()
      .then(setSandboxed)
      .catch(() => setSandboxed(null));
  }, []);

  // Look the program up as the user types, so a typo shows up straight away.
  useEffect(() => {
    if (!command.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      agentFindCommand(command)
        .then((path) => !cancelled && setFound(path))
        .catch(() => !cancelled && setFound(null));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [command]);

  useEffect(() => {
    void refresh();
    const probes = [
      { id: CODEX_ID, command: CODEX_DETECT },
      ...PRESETS.map((p) => ({ id: p.id, command: p.detect })),
    ];
    void Promise.all(
      probes.map((p) =>
        agentFindCommand(p.command)
          .catch(() => null)
          .then((path) => [p.id, path] as const),
      ),
    ).then((entries) => setInstalled(Object.fromEntries(entries)));
  }, [refresh]);

  const customConfig = (): AgentConfig => ({
    kind: "custom",
    command: command.trim(),
    args: splitWords(args),
    dataDirs: dataDirs
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
  });

  /** Uses the agent if it is turned on; otherwise asks the user first. */
  function choose(next: AgentConfig) {
    if (enabled.includes(agentId(next))) void setConfig(next);
    else ask(next);
  }

  async function applyCustom() {
    const next = customConfig();
    if (!enabled.includes(agentId(next))) return ask(next);
    setTesting(true);
    await setConfig(next);
    setTesting(false);
  }

  // Only an agent the user turned on counts as the one in use.
  const turnedOn = enabled.includes(agentId(config));
  const usingCodex = turnedOn && config.kind === "codex";
  const usingPreset = turnedOn ? presetOf(config) : undefined;
  const usingCustom = turnedOn && config.kind === "custom" && !usingPreset;
  const agentBadge =
    status === "ready"
      ? "Ready"
      : status === "checking"
        ? "Starting…"
        : "Could not start";

  // Only agents whose program is on this computer are shown. The one in use
  // stays even if its program has since gone or moved, so the reader can
  // still see which agent they are on and switch away from it.
  const showsCodex = Boolean(installed[CODEX_ID]) || usingCodex;
  const showsPresets = PRESETS.filter(
    (preset) => installed[preset.id] || usingPreset === preset,
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        {showsCodex && (
          <Card
            on={usingCodex}
            title="Codex"
            badge={
              usingCodex
                ? status === "ready"
                  ? "Ready"
                  : status === "checking"
                    ? "Checking…"
                    : "Needs setup"
                : undefined
            }
            onSelect={() => choose({ kind: "codex" })}
          >
            {usingCodex && status === "setup" && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2 rounded-lg"
                onClick={() => {
                  setSettingsPage(false);
                  setSetupOpen(true);
                }}
              >
                Set up Codex
              </Button>
            )}
          </Card>
        )}

        {showsPresets.map((preset) => {
          const on = usingPreset === preset;
          const found = installed[preset.id];
          return (
            <Card
              key={preset.id}
              on={on}
              title={preset.label}
              note={found ? undefined : preset.missing}
              badge={on ? agentBadge : found ? "Installed" : undefined}
              onSelect={() => {
                if (found) choose(preset.config);
              }}
            >
              {on && customError && (
                <p
                  role="alert"
                  className="text-destructive text-meta mt-2 break-words"
                >
                  {customError}
                </p>
              )}
            </Card>
          );
        })}

        <Card
          on={usingCustom}
          title="Custom agent"
          badge={usingCustom ? agentBadge : undefined}
          onSelect={() => {
            if (command.trim()) void applyCustom();
          }}
        >
          <div className="mt-3 flex flex-col gap-2.5">
            <Field label="Command">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="my-agent"
                spellCheck={false}
                className="bg-muted placeholder:text-muted-foreground text-ui h-9 w-full rounded-lg px-3 font-mono outline-none"
              />
              {command.trim() && found !== undefined && (
                <span
                  className={cn(
                    "text-caption mt-1 block truncate",
                    found ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {found ? `Found at ${found}` : "Not found on this computer."}
                </span>
              )}
            </Field>
            <Field label="Arguments">
              <input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--acp"
                spellCheck={false}
                className="bg-muted placeholder:text-muted-foreground text-ui h-9 w-full rounded-lg px-3 font-mono outline-none"
              />
            </Field>
            <Field label="Its data folders (optional, comma separated)">
              <input
                value={dataDirs}
                onChange={(e) => setDataDirs(e.target.value)}
                placeholder="~/.my-agent"
                spellCheck={false}
                className="bg-muted placeholder:text-muted-foreground text-ui h-9 w-full rounded-lg px-3 font-mono outline-none"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                className="rounded-lg"
                disabled={!command.trim() || testing}
                onClick={() => void applyCustom()}
              >
                {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {usingCustom ? "Save and test" : "Use this agent"}
              </Button>
              {usingCustom && status === "ready" && !testing && (
                <span className="text-muted-foreground text-meta flex items-center gap-1">
                  <Check className="size-3.5" aria-hidden /> Started
                </span>
              )}
            </div>
            {usingCustom && customError && !testing && (
              <p
                role="alert"
                className="text-destructive text-meta break-words"
              >
                {customError}
              </p>
            )}
          </div>
        </Card>
      </div>
      {usingPreset?.id === "command-code" && (
        <Setting
          stacked
          label="Command Code plan"
          hint="Yomu can't read which plan your account is on, so pick it here: the model picker hides the models it doesn't include."
        >
          <Segmented<CommandCodePlan | "all">
            label="Command Code plan"
            value={commandCodePlan ?? "all"}
            onChange={(plan) =>
              setCommandCodePlan(plan === "all" ? null : plan)
            }
            options={[
              { value: "all", label: "Show all" },
              { value: "go", label: "Go" },
              { value: "goat", label: "GOAT" },
              { value: "pro", label: "Pro" },
              { value: "max", label: "Max" },
            ]}
          />
        </Setting>
      )}
      {sandboxed === false && (
        <p role="note" className="text-muted-foreground text-ui mt-4">
          This computer can't fence the agent in, so it runs with your own
          permissions.
        </p>
      )}
    </>
  );
}

function Card({
  on,
  title,
  note,
  badge,
  onSelect,
  children,
}: {
  on: boolean;
  title: string;
  note?: string;
  badge?: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 transition-colors",
        on ? "bg-accent" : "bg-muted/60",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onSelect}
        className="focus-visible:ring-ring/60 flex w-full items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2"
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
            on ? "border-foreground" : "border-input",
          )}
        >
          {on && <span className="bg-foreground size-2 rounded-full" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-prose flex items-center gap-2 font-semibold">
            {title}
            {badge && (
              <span className="bg-background text-muted-foreground text-caption rounded-full px-2 py-0.5 font-normal">
                {badge}
              </span>
            )}
          </span>
          {note && (
            <span className="text-muted-foreground text-meta">{note}</span>
          )}
        </span>
      </button>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground text-caption mb-1 block font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}

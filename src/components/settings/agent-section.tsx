import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentFindCommand } from "@/lib/commands";
import { isOpenCode, OPENCODE } from "@/lib/agents";
import { joinWords, splitWords } from "@/lib/shell-words";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useUiStore } from "@/stores/ui-store";

/** Which agent Yomu talks to: Codex, OpenCode, or any program that speaks
 * ACP over stdio. */
export function AgentSection() {
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const setSettingsPage = useSpacesStore((s) => s.setSettingsPage);
  const config = useAgentStore((s) => s.config);
  const status = useAgentStore((s) => s.status);
  const customError = useAgentStore((s) => s.customError);
  const setConfig = useAgentStore((s) => s.setConfig);
  const refresh = useAgentStore((s) => s.refreshStatus);

  const custom = config.kind === "custom" ? config : null;
  const [command, setCommand] = useState(custom?.command ?? "");
  const [args, setArgs] = useState(custom ? joinWords(custom.args) : "");
  const [dataDirs, setDataDirs] = useState(custom?.dataDirs.join(", ") ?? "");
  const [openCodeFound, setOpenCodeFound] = useState<string | null>(null);
  const [found, setFound] = useState<string | null | undefined>(undefined);
  const [testing, setTesting] = useState(false);

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
    agentFindCommand(OPENCODE.command)
      .then(setOpenCodeFound)
      .catch(() => setOpenCodeFound(null));
  }, [refresh]);

  async function applyCustom() {
    setTesting(true);
    await setConfig({
      kind: "custom",
      command: command.trim(),
      args: splitWords(args),
      dataDirs: dataDirs
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
    });
    setTesting(false);
  }

  const usingCodex = config.kind === "codex";
  const usingOpenCode = isOpenCode(config);
  const usingCustom = !usingCodex && !usingOpenCode;
  const agentBadge =
    status === "ready"
      ? "Ready"
      : status === "checking"
        ? "Starting…"
        : "Could not start";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Card
          on={usingCodex}
          title="Codex"
          note="Your local Codex, signed in with your ChatGPT plan. Needs Node.js."
          badge={
            usingCodex
              ? status === "ready"
                ? "Ready"
                : status === "checking"
                  ? "Checking…"
                  : "Needs setup"
              : undefined
          }
          onSelect={() => void setConfig({ kind: "codex" })}
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

        <Card
          on={usingOpenCode}
          title="OpenCode"
          note={
            openCodeFound
              ? "Your local OpenCode, with whichever provider and model you have set up in it."
              : "Not found on this computer. Install OpenCode, then sign in with `opencode auth login`."
          }
          badge={
            usingOpenCode ? agentBadge : openCodeFound ? "Installed" : undefined
          }
          onSelect={() => {
            if (openCodeFound) void setConfig(OPENCODE);
          }}
        >
          {usingOpenCode && customError && (
            <p
              role="alert"
              className="text-destructive mt-2 text-[0.75rem] break-words"
            >
              {customError}
            </p>
          )}
        </Card>

        <Card
          on={usingCustom}
          title="Custom agent"
          note="Any program that speaks ACP (the Agent Client Protocol) over stdio."
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
                className="bg-muted placeholder:text-muted-foreground h-9 w-full rounded-lg px-3 font-mono text-[0.8125rem] outline-none"
              />
              {command.trim() && found !== undefined && (
                <span
                  className={cn(
                    "mt-1 block truncate text-[0.6875rem]",
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
                className="bg-muted placeholder:text-muted-foreground h-9 w-full rounded-lg px-3 font-mono text-[0.8125rem] outline-none"
              />
            </Field>
            <Field label="Its data folders (optional, comma separated)">
              <input
                value={dataDirs}
                onChange={(e) => setDataDirs(e.target.value)}
                placeholder="~/.my-agent"
                spellCheck={false}
                className="bg-muted placeholder:text-muted-foreground h-9 w-full rounded-lg px-3 font-mono text-[0.8125rem] outline-none"
              />
              <span className="text-muted-foreground mt-1 block text-[0.6875rem]">
                Where the agent keeps its own state, such as its sign-in. These
                are the only folders it may write to.
              </span>
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
                <span className="text-muted-foreground flex items-center gap-1 text-[0.75rem]">
                  <Check className="size-3.5" aria-hidden /> Started
                </span>
              )}
            </div>
            {usingCustom && customError && !testing && (
              <p
                role="alert"
                className="text-destructive text-[0.75rem] break-words"
              >
                {customError}
              </p>
            )}
          </div>
        </Card>
      </div>

      <p className="text-muted-foreground mt-4 text-[0.8125rem] leading-relaxed">
        Safety: whichever agent you use runs read-only in an empty temporary
        folder. On macOS the whole process is sandboxed: it cannot write files
        (apart from its own data folders) or read your documents. This cannot be
        turned off.
      </p>
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
  note: string;
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
          <span className="flex items-center gap-2 text-[0.875rem] font-semibold">
            {title}
            {badge && (
              <span className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem] font-normal">
                {badge}
              </span>
            )}
          </span>
          <span className="text-muted-foreground text-[0.75rem]">{note}</span>
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
      <span className="text-muted-foreground mb-1 block text-[0.6875rem] font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MessageSquare, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";

export function ChatPanel() {
  const toggleChatPanel = useUiStore((s) => s.toggleChatPanel);
  const status = useAgentStore((s) => s.status);
  const refreshStatus = useAgentStore((s) => s.refreshStatus);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <aside className="border-border bg-muted/20 flex h-full w-80 shrink-0 flex-col border-l">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="text-muted-foreground size-4" />
          Explain
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Collapse panel"
          onClick={toggleChatPanel}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      {status === "ready" ? <DebugChat /> : <Onboarding status={status} />}
    </aside>
  );
}

function Onboarding({
  status,
}: {
  status: "checking" | "missing" | "logged_out";
}) {
  const login = useAgentStore((s) => s.login);
  const refreshStatus = useAgentStore((s) => s.refreshStatus);

  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
      {status === "checking" && <Loader2 className="size-4 animate-spin" />}
      {status === "missing" && (
        <>
          <p>Codex CLI isn't installed.</p>
          <p className="text-xs">
            Install it, then check again — Yomu uses your ChatGPT subscription
            through it, no API key needed.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshStatus()}
          >
            Check again
          </Button>
        </>
      )}
      {status === "logged_out" && (
        <>
          <p>Codex is installed but not signed in.</p>
          <Button size="sm" onClick={() => void login()}>
            Sign in with ChatGPT
          </Button>
        </>
      )}
    </div>
  );
}

function DebugChat() {
  const messages = useAgentStore((s) => s.messages);
  const streaming = useAgentStore((s) => s.streaming);
  const error = useAgentStore((s) => s.error);
  const send = useAgentStore((s) => s.send);
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void send(text);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <p>Select text in the reader</p>
            <p className="text-xs">
              Your agent's explanation appears here. (Debug chat for now — the
              reader selection flow lands in M5.)
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, i) => (
              <div
                key={i}
                className={
                  message.role === "user"
                    ? "bg-primary text-primary-foreground self-end rounded-lg px-3 py-1.5 text-sm"
                    : "bg-muted text-foreground self-start rounded-lg px-3 py-1.5 text-sm"
                }
              >
                {message.text ||
                  (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-xs">
            {error}
          </p>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-border flex items-center gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          disabled={streaming}
          className="border-border bg-background focus-visible:ring-ring/50 h-8 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
        />
        <Button size="sm" type="submit" disabled={streaming || !input.trim()}>
          {streaming ? <Loader2 className="size-4 animate-spin" /> : "Send"}
        </Button>
      </form>
    </div>
  );
}

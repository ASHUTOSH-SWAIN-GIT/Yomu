import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, MessageSquare, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";
import { Markdown } from "@/components/chat/markdown";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore, type ChatMessage } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";

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

      {status === "ready" ? <ChatBody /> : <Onboarding status={status} />}
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

function ChatBody() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, error]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming || !article) return;
    setInput("");
    void send(article, text);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !error ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <p>
              {article ? "Select text in the article" : "Open an article first"}
            </p>
            <p className="text-xs">
              Highlight a passage and press Explain. Your local Codex agent
              answers here, and you can ask follow ups.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, i) => (
              <Message
                key={i}
                message={message}
                pending={streaming && i === messages.length - 1}
              />
            ))}
            {streaming && messages[messages.length - 1]?.role === "user" && (
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            )}
          </div>
        )}
        {error && (
          <div className="bg-destructive/10 text-destructive mt-3 flex flex-col gap-2 rounded-md px-3 py-2 text-xs">
            <p>{error.message}</p>
            {error.kind !== "logged_out" && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => void retry()}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-border flex items-center gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a follow up…"
          disabled={streaming || messages.length === 0}
          className="border-border bg-background focus-visible:ring-ring/50 h-8 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
        />
        <Button
          size="sm"
          type="submit"
          disabled={streaming || messages.length === 0 || !input.trim()}
        >
          Send
        </Button>
      </form>
    </div>
  );
}

function Message({
  message,
  pending,
}: {
  message: ChatMessage;
  pending: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="bg-primary text-primary-foreground self-end rounded-lg px-3 py-1.5 text-sm">
        {message.quote && (
          <blockquote className="border-primary-foreground/40 mb-1 line-clamp-4 border-l-2 pl-2 text-xs opacity-80">
            {message.quote}
          </blockquote>
        )}
        {message.quote ? "Explain this" : message.text}
      </div>
    );
  }
  return (
    <div className="bg-muted text-foreground self-start rounded-lg px-3 py-1.5 text-sm">
      <Markdown>{message.text}</Markdown>
      {pending && <span className="text-muted-foreground">…</span>}
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Loader2,
  MessageSquare,
  PanelRightClose,
  RefreshCw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";
import { parseImageQuote } from "@/lib/images";
import { logError } from "@/lib/log";
import { SetupChecklist } from "@/components/chat/setup-checklist";
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

      {status === "ready" ? (
        <ChatBody />
      ) : status === "checking" ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center">
          <Loader2
            className="size-4 animate-spin"
            aria-label="Checking setup"
          />
        </div>
      ) : (
        <SetupChecklist />
      )}
    </aside>
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
  const stop = useChatStore((s) => s.stop);
  const regenerate = useChatStore((s) => s.regenerate);
  const summarize = useChatStore((s) => s.summarize);
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
      <div
        role="log"
        aria-live="polite"
        aria-label="Explanation chat"
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && !error ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <p>
              {article ? "Select text in the article" : "Open an article first"}
            </p>
            <p className="text-xs">
              Highlight a passage and press Explain. Your local Codex agent
              answers here, and you can ask follow ups.
            </p>
            {article && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void summarize(article)}
              >
                Summarize this article
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, i) => (
              <Message
                key={i}
                message={message}
                pending={streaming && i === messages.length - 1}
                onRegenerate={
                  article && !streaming && i === messages.length - 1
                    ? () => void regenerate(article)
                    : undefined
                }
              />
            ))}
            {article &&
              !streaming &&
              !error &&
              messages[messages.length - 1]?.role === "assistant" && (
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UPS.map((f) => (
                    <Button
                      key={f.label}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void send(article, f.prompt)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              )}
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
          aria-label="Ask a follow up"
          disabled={streaming || messages.length === 0}
          className="border-input bg-background focus-visible:ring-ring/50 h-8 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
        />
        {streaming ? (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void stop()}
          >
            <Square className="size-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            type="submit"
            disabled={messages.length === 0 || !input.trim()}
          >
            Send
          </Button>
        )}
      </form>
    </div>
  );
}

const FOLLOW_UPS = [
  {
    label: "Simpler",
    prompt: "Explain that more simply, as if I'm new to this.",
  },
  {
    label: "Go deeper",
    prompt: "Go deeper: cover the details and edge cases.",
  },
  { label: "Show an example", prompt: "Show a short code example." },
];

function Message({
  message,
  pending,
  onRegenerate,
}: {
  message: ChatMessage;
  pending: boolean;
  onRegenerate?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div
        id={message.highlightId && `highlight-${message.highlightId}`}
        className="bg-primary text-primary-foreground self-end rounded-lg px-3 py-1.5 text-sm"
      >
        {message.quote && (
          <blockquote className="border-primary-foreground/40 mb-1 line-clamp-4 border-l-2 pl-2 text-xs opacity-80">
            {parseImageQuote(message.quote)
              ? `Image: ${parseImageQuote(message.quote)?.alt || "attached image"}`
              : message.quote}
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
      {!pending && message.text && (
        <div className="mt-1 flex gap-1">
          <CopyButton text={message.text} />
          {onRegenerate && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6"
              aria-label="Regenerate answer"
              onClick={onRegenerate}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logError("copy failed", err);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-6"
      aria-label={copied ? "Copied" : "Copy answer"}
      onClick={() => void copy()}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

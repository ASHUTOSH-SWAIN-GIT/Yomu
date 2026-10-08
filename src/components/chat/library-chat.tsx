import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/chat/composer";
import { AgentActivity } from "@/components/chat/agent-activity";
import { ContextNote } from "@/components/chat/context-note";
import { ErrorNote } from "@/components/chat/error-note";
import { SourceChips } from "@/components/chat/source-link";
import { hasProgress } from "@/lib/agent-progress";
import { CopyButton } from "@/components/chat/copy-button";
import { Markdown } from "@/components/chat/markdown";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";

const IDEAS = [
  "What have I saved about databases?",
  "Summarize my most recent reads",
  "Which of my articles disagree with each other?",
];

/** The universal chat page: one big box in the middle of the page, for
 * talking with everything you have saved. Once the conversation
 * starts, the box moves to the bottom. */
export function LibraryChat() {
  const messages = useLibraryChatStore((s) => s.messages);
  const streaming = useLibraryChatStore((s) => s.streaming);
  const progress = useLibraryChatStore((s) => s.progress);
  const contextUsage = useLibraryChatStore((s) => s.context);
  const error = useLibraryChatStore((s) => s.error);
  const ask = useLibraryChatStore((s) => s.ask);
  const stop = useLibraryChatStore((s) => s.stop);
  const retry = useLibraryChatStore((s) => s.retry);
  const count = useLibraryStore((s) => s.articles.length);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const ready = useAgentStore((s) => s.status) === "ready";

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;
  const waiting =
    streaming && messages[messages.length - 1]?.role !== "assistant";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

  function send(question: string) {
    if (!question.trim() || streaming) return;
    if (!ready) return setSetupOpen(true);
    void ask(question);
    setText("");
  }

  const box = (
    <Composer
      id="library-chat-input"
      value={text}
      onChange={setText}
      onSend={send}
      onStop={() => void stop()}
      onSetup={() => setSetupOpen(true)}
      streaming={streaming}
      ready={ready}
      placeholder={
        ready ? "Ask anything about your blogs" : "Set up Explain to chat"
      }
      autoFocus
      tall={!started}
    />
  );

  const context = (
    <p className="text-muted-foreground text-center text-[0.75rem]">
      Can also draw on your {count} saved {count === 1 ? "article" : "articles"}
      .
    </p>
  );

  if (!started) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-[52rem] flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="mb-8 text-center text-[1.875rem] font-medium tracking-[-0.02em]">
          What do you want to know?
        </h1>
        {box}
        <div className="mt-3">{context}</div>
        {error && <ErrorNote error={error} onRetry={retry} />}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => send(idea)}
              className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 h-9 rounded-full px-4 text-[0.8125rem] outline-none focus-visible:ring-2"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <ul className="mx-auto flex w-full max-w-[52rem] flex-col gap-7 pb-8">
          {messages.map((m, i) =>
            m.role === "user" ? (
              // Yours: a bubble on the right, as wide as the message.
              <li key={i} className="flex justify-end">
                <p className="bg-muted max-w-[80%] rounded-3xl px-5 py-2.5 text-[0.9375rem] leading-6 whitespace-pre-wrap">
                  {m.text}
                </p>
              </li>
            ) : (
              // The agent's: plain text on the page, with a copy button.
              <li key={i} className="group text-[0.9375rem] leading-7">
                {m.trace && <AgentActivity progress={m.trace} finished />}
                <Markdown>{m.text}</Markdown>
                {!(streaming && i === messages.length - 1) && (
                  <>
                    <SourceChips text={m.text} />
                    <CopyButton text={m.text} />
                  </>
                )}
              </li>
            ),
          )}
          {streaming && hasProgress(progress) && (
            <li>
              <AgentActivity progress={progress} />
            </li>
          )}
          {waiting && (
            <li
              aria-label="Thinking"
              className="text-muted-foreground flex gap-1 py-2"
            >
              {[0, 150, 300].map((delay) => (
                <i
                  key={delay}
                  className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </li>
          )}
          {error && <ErrorNote error={error} onRetry={retry} />}
          <div ref={endRef} />
        </ul>
      </div>
      <div className="mx-auto w-full max-w-[52rem] shrink-0 px-6 pb-4">
        {box}
        <div className="mt-2">{context}</div>
        <ContextNote usage={contextUsage} />
      </div>
    </div>
  );
}

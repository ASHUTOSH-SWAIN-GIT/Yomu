import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  CornerDownRight,
  MessageSquare,
  Quote,
  Square,
  X,
} from "lucide-react";
import { AnswerSheet } from "@/components/chat/answer-sheet";
import { Segmented } from "@/components/ui/segmented";
import { groupExchanges } from "@/lib/exchanges";
import {
  ARTICLE_ACTIONS,
  PASSAGE_ACTIONS,
  type QuickAction,
} from "@/lib/quick-actions";
import { isThreadScope } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiStore } from "@/stores/ui-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

type AskScope = "article" | "library";

/**
 * The Explain surface: a bar that is always there at the bottom of the
 * article. Selecting text attaches the passage as a chip (nothing pops up);
 * Enter on an empty bar explains it, typing asks about it. With nothing
 * attached the bar asks about the whole article, or across the saved library.
 * Passage answers are written in the margin; article and library answers
 * open in a sheet above the bar. Everything runs through the chat store.
 */
export function AskBar() {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const selection = useSelectionStore((s) => s.selection);
  const setSelection = useSelectionStore((s) => s.set);
  const replyTo = useSelectionStore((s) => s.replyTo);
  const setReplyTo = useSelectionStore((s) => s.setReplyTo);
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const explain = useChatStore((s) => s.explain);
  const askAbout = useChatStore((s) => s.askAbout);
  const send = useChatStore((s) => s.send);
  const askArticle = useChatStore((s) => s.askArticle);
  const askLibrary = useChatStore((s) => s.askLibrary);
  const stop = useChatStore((s) => s.stop);
  const answerOpen = useUiStore((s) => s.answerOpen);
  const notesInMargin = useUiStore((s) => s.notesInMargin);
  const focusMode = useUiStore((s) => s.focusMode);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const agentStatus = useAgentStore((s) => s.status);

  const [text, setText] = useState("");
  const [scope, setScope] = useState<AskScope>("article");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = agentStatus === "ready";

  // In a wide window passage answers live in the margin, so the sheet only
  // has the article and library thread; in a narrow one it shows everything.
  const exchanges = groupExchanges(messages);
  const sheetHasContent = notesInMargin
    ? exchanges.some((e) => isThreadScope(e.question.scope))
    : exchanges.length > 0;
  const sheetVisible = answerOpen && sheetHasContent;

  function clearAttached() {
    setSelection(null);
    setReplyTo(null);
    window.getSelection()?.removeAllRanges();
  }

  /** Runs a question about whatever is attached: the selected passage (an
   * explanation when empty), the note being replied to, or the article /
   * library. `prompt` overrides what was typed; "" means "just explain". */
  function run(prompt: string | null, typed = text) {
    if (!article || streaming) return;
    const question = (prompt ?? typed).trim();
    if (!ready) return setSetupOpen(true);
    if (selection) {
      if (question) void askAbout(article, selection, question);
      else void explain(article, selection);
    } else if (replyTo) {
      if (!question) return;
      void send(article, question);
    } else if (question) {
      void (scope === "library" ? askLibrary : askArticle)(article, question);
    } else return;
    clearAttached();
    setText("");
  }

  // Cmd/Ctrl+E: explain the selection, or jump to the bar.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      e.preventDefault();
      if (!ready) return setSetupOpen(true);
      if (selection && article) run(null);
      else inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Escape lets go of the attached passage or note.
  const attached = selection !== null || replyTo !== null;
  useEffect(() => {
    if (!attached) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clearAttached();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // clearAttached only touches stable store setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attached]);

  if (!article || focusMode) return null;

  const actions: QuickAction[] = attached
    ? PASSAGE_ACTIONS
    : scope === "article"
      ? ARTICLE_ACTIONS
      : [];
  const typed = text.trim().length > 0;
  const placeholder = !ready
    ? "Set up Explain to ask"
    : selection
      ? "Ask about this passage, or press ↵ to explain"
      : replyTo
        ? `Reply to note ${replyTo.number}…`
        : scope === "library"
          ? "Ask across your saved articles…"
          : "Ask about this article…";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(null);
  }

  return (
    // The gradient keeps article text from showing through around the bar.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2.5 bg-[linear-gradient(to_top,var(--background)_45%,transparent)] px-6 pt-12 pb-5">
      {sheetVisible && <AnswerSheet threadOnly={notesInMargin} />}

      <div className="group/ask pointer-events-auto w-[min(38rem,100%)]">
        {ready && !streaming && actions.length > 0 && (
          <div
            className={cn(
              "mb-2 flex-wrap justify-center gap-1.5",
              attached ? "flex" : "hidden group-focus-within/ask:flex",
            )}
          >
            {selection && (
              <ActionButton primary onClick={() => run("")}>
                Explain
                <kbd className="font-sans text-[0.6875rem] opacity-60">
                  {MOD}E
                </kbd>
              </ActionButton>
            )}
            {actions.map((a) => (
              <ActionButton
                key={a.id}
                onClick={() => run(attached ? a.prompt : a.message)}
              >
                {a.label}
              </ActionButton>
            ))}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          aria-label="Ask the agent"
          className="rise-in bg-popover text-popover-foreground focus-within:ring-ring/40 overflow-hidden rounded-2xl shadow-[var(--shadow-float)] focus-within:ring-2"
        >
          {selection && (
            <Chip
              icon={<Quote className="text-honey-ink size-3.5" />}
              onClear={clearAttached}
            >
              <span className="line-clamp-2 font-serif italic">
                {selection.text}
              </span>
            </Chip>
          )}
          {replyTo && (
            <Chip
              icon={<CornerDownRight className="text-honey-ink size-3.5" />}
              onClear={clearAttached}
            >
              Replying to note {replyTo.number}
            </Chip>
          )}

          <div className="flex h-12 items-center gap-2 pr-1.5 pl-4">
            <input
              id="ask-input"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                if (text) setText("");
                else inputRef.current?.blur();
              }}
              disabled={streaming || !ready}
              placeholder={placeholder}
              aria-label="Ask the agent"
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none disabled:opacity-60"
            />

            {ready && !attached && !streaming && (
              <Segmented<AskScope>
                label="What to ask about"
                value={scope}
                onChange={setScope}
                options={[
                  { value: "article", label: "Article" },
                  { value: "library", label: "Library" },
                ]}
                className="hidden sm:inline-flex"
              />
            )}
            {sheetHasContent && (
              <button
                type="button"
                aria-label="Show the answer sheet"
                aria-pressed={sheetVisible}
                onClick={() => setAnswerOpen(!answerOpen)}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring/60 grid size-8 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2",
                  sheetVisible
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <MessageSquare className="size-4" />
              </button>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="bg-secondary hover:bg-accent focus-visible:ring-ring/60 flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[0.8125rem] font-medium outline-none focus-visible:ring-2"
              >
                <Square className="size-3" aria-hidden /> Stop
              </button>
            ) : !ready ? (
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="bg-primary text-primary-foreground focus-visible:ring-ring/60 flex h-9 shrink-0 items-center rounded-xl px-3.5 text-[0.8125rem] font-semibold outline-none focus-visible:ring-2"
              >
                Set up Explain
              </button>
            ) : (
              <button
                type="submit"
                disabled={!selection && !typed}
                aria-label={selection && !typed ? "Explain" : "Ask"}
                className="bg-primary text-primary-foreground focus-visible:ring-ring/60 disabled:bg-secondary disabled:text-muted-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[0.8125rem] font-semibold outline-none focus-visible:ring-2"
              >
                {selection && !typed ? (
                  "Explain"
                ) : (
                  <>
                    Ask
                    <ArrowUp className="size-3.5" aria-hidden />
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/** The attached passage or note, above the input. */
function Chip({
  icon,
  onClear,
  children,
}: {
  icon: React.ReactNode;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pop-in border-border text-muted-foreground flex items-start gap-2.5 border-b px-4 py-2.5 text-[0.8125rem]">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        aria-label="Remove"
        onClick={onClear}
        className="hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 -mt-0.5 -mr-1 shrink-0 rounded-md p-1 outline-none focus-visible:ring-2"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ActionButton({
  onClick,
  primary,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/60 flex h-7 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-medium shadow-[var(--shadow-card)] transition-colors outline-none focus-visible:ring-2",
        primary
          ? "bg-primary text-primary-foreground"
          : "bg-popover text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import { groupExchanges, pickExchange, type Exchange } from "@/lib/exchanges";
import { parseImageQuote } from "@/lib/images";
import { logError } from "@/lib/log";
import { SUMMARY_LABEL, isThreadScope } from "@/lib/scope";
import { citedArticles } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

/** What the sheet is titled, from the kind of question it shows. */
function titleOf(e: Exchange): string {
  const { scope, text, quote } = e.question;
  if (scope === "library") return "From your library";
  if (scope === "article")
    return text === SUMMARY_LABEL ? "Summary" : "Article";
  return quote && parseImageQuote(quote) ? "About this image" : "Explained";
}

/**
 * The answer above the Ask bar. In a wide window it is the thread of
 * article and library questions (passage answers live in the margin); in a
 * narrow one it shows every answer, since there is no margin. Shows the
 * latest exchange (or the one for a clicked passage), with copy, regenerate,
 * history, and links to the saved articles a library answer cites.
 */
export function AnswerSheet({ threadOnly }: { threadOnly: boolean }) {
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const regenerate = useChatStore((s) => s.regenerate);
  const retry = useChatStore((s) => s.retry);
  const answerFocus = useUiStore((s) => s.answerFocus);
  const setAnswerFocus = useUiStore((s) => s.setAnswerFocus);
  const setAnswerOpen = useUiStore((s) => s.setAnswerOpen);
  const library = useLibraryStore((s) => s.articles);
  const openArticle = useTabsStore((s) => s.openArticle);
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const all = groupExchanges(messages);
  const exchanges = threadOnly
    ? all.filter((e) => isThreadScope(e.question.scope))
    : all;
  const current = pickExchange(exchanges, threadOnly ? null : answerFocus);
  // The error belongs to the latest question asked, wherever it is shown.
  const latest = all[all.length - 1] === current;
  const answer = current?.answers[current.answers.length - 1];
  const sources =
    current?.question.scope === "library" && answer?.text
      ? citedArticles(
          answer.text,
          // The open article needs no link to itself.
          library.filter((a) => a.id !== article?.id),
        )
      : [];

  // Follow the answer as it streams.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, error, history]);

  if (!current) return null;

  async function copy() {
    if (!answer?.text) return;
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logError("copy failed", err);
    }
  }

  return (
    <section
      aria-label="Answer"
      className="rise-in bg-popover text-popover-foreground pointer-events-auto flex max-h-[min(26rem,50vh)] w-[min(42.5rem,100%)] flex-col rounded-2xl shadow-[var(--shadow-float)]"
    >
      <header className="flex shrink-0 items-center gap-2 px-5 pt-3.5 pb-2 text-[0.75rem] font-medium">
        <Sparkles aria-hidden className="text-honey-ink size-3.5" />
        {titleOf(current)}
        <span className="ml-auto flex items-center gap-1 font-medium">
          {exchanges.length > 1 && (
            <button
              type="button"
              aria-pressed={history}
              onClick={() => setHistory((v) => !v)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.6875rem] outline-none focus-visible:ring-1"
            >
              <History className="size-3.5" aria-hidden />
              History · {exchanges.length}
            </button>
          )}
          <button
            type="button"
            aria-label="Close answer"
            onClick={() => setAnswerOpen(false)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-md p-1 outline-none focus-visible:ring-2"
          >
            <X className="size-4" />
          </button>
        </span>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-2"
        role="log"
        aria-live="polite"
      >
        {history ? (
          <ol className="flex flex-col gap-4 pb-1">
            {exchanges.map((e, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setAnswerFocus(e.question.highlightId ?? null);
                    setHistory(false);
                  }}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 w-full rounded text-left text-[0.8125rem] outline-none focus-visible:ring-2"
                >
                  {e.question.quote && (
                    <span className="border-border mb-1 line-clamp-2 block border-l pl-2.5 font-serif italic">
                      {parseImageQuote(e.question.quote)?.alt ||
                        e.question.quote}
                    </span>
                  )}
                  <span className="font-semibold">{e.question.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {current.question.quote && (
              <blockquote className="border-honey text-muted-foreground mb-3 line-clamp-3 border-l-2 pl-3 font-serif text-[0.875rem] italic">
                {parseImageQuote(current.question.quote)?.alt ||
                  current.question.quote}
              </blockquote>
            )}
            {current.question.text !== SUMMARY_LABEL &&
              current.question.text !== "Explain this" &&
              !parseImageQuote(current.question.quote ?? "") && (
                <p className="mb-2 text-[0.8125rem] font-medium">
                  {current.question.text}
                </p>
              )}
            <div className="text-[0.875rem] leading-[1.65] text-[var(--reader-ink)]">
              {answer?.text ? (
                <Markdown>{answer.text}</Markdown>
              ) : streaming && latest ? (
                <Loader2
                  className="text-muted-foreground size-4 animate-spin"
                  aria-label="Thinking"
                />
              ) : null}
              {streaming && latest && answer?.text && (
                <span
                  aria-hidden
                  className="text-muted-foreground animate-pulse"
                >
                  ▍
                </span>
              )}
            </div>
            {sources.length > 0 && !streaming && (
              <ul
                aria-label="Sources"
                className="mt-3 flex flex-wrap gap-1.5 pb-1"
              >
                {sources.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void openArticle(s.id)}
                      className="bg-secondary hover:bg-accent focus-visible:ring-ring/60 flex h-7 max-w-[16rem] items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] font-medium outline-none focus-visible:ring-2"
                    >
                      <span className="truncate">{s.title}</span>
                      <ArrowUpRight className="size-3 shrink-0 opacity-60" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && latest && (
          <div className="border-destructive/40 text-destructive mt-3 flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-[0.75rem]">
            <p>{error.message}</p>
            {error.kind !== "logged_out" && (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => void retry()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!history && answer?.text && (
        <footer className="border-border flex shrink-0 items-center gap-1 border-t px-3.5 py-2">
          <SheetButton onClick={() => void copy()}>
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </SheetButton>
          {latest && article && (
            <SheetButton
              disabled={streaming}
              onClick={() => void regenerate(article)}
            >
              <RefreshCw className="size-3.5" />
              Regenerate
            </SheetButton>
          )}
        </footer>
      )}
    </section>
  );
}

function SheetButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.75rem] font-medium outline-none focus-visible:ring-2 disabled:opacity-50 [&>svg]:size-3.5",
      )}
    >
      {children}
    </button>
  );
}

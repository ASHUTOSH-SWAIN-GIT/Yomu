import { useRef, useState, type FormEvent } from "react";
import { LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockRenderer } from "@/components/reader/block-renderer";
import { ExplainButton } from "@/components/reader/explain-button";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useChatStore } from "@/stores/chat-store";
import { useReaderStore, type ReaderState } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

export function ReaderView() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    void openUrl(url);
  }

  return (
    <main className="flex h-full flex-1 flex-col overflow-y-auto">
      {state.status === "ready" ? (
        <Article article={state.article} />
      ) : (
        <EmptyState
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          state={state}
        />
      )}
    </main>
  );
}

function EmptyState({
  input,
  onInputChange,
  onSubmit,
  state,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  state: ReaderState;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <LinkIcon className="text-muted-foreground size-5" />
      </div>
      <h1 className="text-foreground text-lg font-medium">
        Paste a link to start reading
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Docs, engineering blogs, and free articles render here as a clean,
        distraction free reader.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-2 flex w-full max-w-sm items-center gap-2"
      >
        <input
          type="url"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="https://..."
          disabled={state.status === "loading"}
          className="border-border bg-background focus-visible:ring-ring/50 h-9 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
        />
        <Button size="sm" type="submit" disabled={state.status === "loading"}>
          {state.status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Open"
          )}
        </Button>
      </form>
      {state.status === "error" && (
        <p className="bg-destructive/10 text-destructive max-w-sm rounded-md px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
    </div>
  );
}

function Article({ article }: { article: StoredArticle }) {
  const ref = useRef<HTMLElement>(null);
  const [anchor, clear] = useTextSelection(ref);
  const streaming = useChatStore((s) => s.streaming);
  const explain = useChatStore((s) => s.explain);

  function handleExplain() {
    if (!anchor) return;
    void explain(article, anchor.selection);
    window.getSelection()?.removeAllRanges();
    clear();
  }

  return (
    <article ref={ref} className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="border-border mb-6 border-b pb-6">
        <h1 className="text-foreground text-2xl font-semibold">
          {article.title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {[article.author, article.site].filter(Boolean).join(" · ")}
        </p>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground mt-1 block truncate text-xs underline-offset-2 hover:underline"
        >
          {article.url}
        </a>
      </header>
      <BlockRenderer blocks={article.blocks} />
      {anchor && (
        <ExplainButton
          anchor={anchor}
          disabled={streaming}
          onExplain={handleExplain}
        />
      )}
    </article>
  );
}

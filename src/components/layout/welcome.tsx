import { useState, type FormEvent } from "react";
import { Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import {
  articlesInSpace,
  buildSpaces,
  displaySpaceName,
  INBOX,
} from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { openSampleArticle } from "@/lib/sample-article";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useTabsStore } from "@/stores/tabs-store";

/** The page of an empty tab: paste a link, pick a space, continue reading.
 * The headline names the active space, and only that space wears its colour. */
export function Welcome() {
  const state = useReaderStore((s) => s.state);
  const openUrl = useReaderStore((s) => s.openUrl);
  const articles = useLibraryStore((s) => s.articles);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const openArticle = useTabsStore((s) => s.openArticle);
  const [input, setInput] = useState("");

  const loading = state.status === "loading";
  const spaces = buildSpaces(articles, extra, slots, active).slice(0, 6);
  const recent = (
    articlesInSpace(articles, active).length > 0
      ? articlesInSpace(articles, active)
      : articles.filter((a) => !a.archived)
  ).slice(0, 4);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (url && !loading) void openUrl(url);
  }

  const heading = active === INBOX ? "Inbox" : displaySpaceName(active);

  return (
    <div className="mx-auto w-full max-w-[36rem] px-6 pt-[clamp(4rem,22vh,11rem)] pb-40">
      <p className="text-muted-foreground font-serif text-[0.8125rem] italic">
        読む, to read
      </p>
      <h1 className="mt-1 text-[1.375rem] leading-tight font-medium tracking-[-0.015em]">
        What will you read next?
      </h1>

      <form
        onSubmit={submit}
        className="border-input focus-within:border-foreground mt-6 flex h-11 items-center gap-2.5 rounded-lg border pr-1.5 pl-3 transition-colors"
      >
        <LinkIcon
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        <input
          type="url"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Paste a link"
          aria-label="Article URL"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || !input.trim()}
          className="h-8 rounded-md px-3 text-[0.75rem]"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Open"}
        </Button>
      </form>
      {state.status === "error" && (
        <p
          role="alert"
          className="border-destructive/40 text-destructive mt-3 rounded-lg border px-3 py-2.5 text-[0.75rem]"
        >
          {state.message}
        </p>
      )}

      {spaces.length > 1 && (
        <div className="mt-8 flex flex-wrap gap-1.5" aria-label="Spaces">
          {spaces.map((space) => {
            const on = space.id === active;
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => setActive(space.id)}
                aria-pressed={on}
                className={cn(
                  "focus-visible:ring-ring/60 flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[0.75rem] outline-none focus-visible:ring-1",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-input",
                )}
              >
                {space.name}
                <span className={on ? "opacity-60" : "opacity-70"}>
                  {space.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="continue-heading">
          <h2
            id="continue-heading"
            className="text-muted-foreground mb-2 text-[0.75rem]"
          >
            Continue reading in {heading}
          </h2>
          <ul className="border-border border-t">
            {recent.map((a) => (
              <li key={a.id} className="border-border border-b">
                <button
                  type="button"
                  onClick={() => void openArticle(a.id)}
                  className="group focus-visible:ring-ring/60 flex h-10 w-full items-center gap-3 text-left outline-none focus-visible:ring-1"
                >
                  <span className="group-hover:text-foreground truncate text-[0.8125rem] text-white/85">
                    {a.title}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[0.6875rem] tabular-nums">
                    {a.progress > 0 && `${Math.round(a.progress * 100)}%  `}
                    {formatRelativeTime(a.scrapedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {articles.length === 0 ? (
        <div className="mt-10">
          <p className="text-muted-foreground max-w-[26rem] text-[0.8125rem] leading-relaxed">
            Paste a link and it opens as a clean page. Select any passage to ask
            your local Codex about it.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-[0.75rem]"
            onClick={() => void openSampleArticle()}
          >
            Take the two minute tour
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openSampleArticle()}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-6 rounded text-[0.75rem] underline underline-offset-4 outline-none focus-visible:ring-1"
        >
          Open the tour again
        </button>
      )}
    </div>
  );
}

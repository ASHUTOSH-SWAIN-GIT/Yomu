import { useState, type FormEvent } from "react";
import { ArrowRight, Link as LinkIcon, Loader2 } from "lucide-react";
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

  return (
    <div className="mx-auto w-full max-w-[47.5rem] px-6 pt-[clamp(3rem,14vh,7rem)] pb-40">
      <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
        What&rsquo;s next in{" "}
        <span className="text-space">
          {active === INBOX ? "your Inbox" : displaySpaceName(active)}
        </span>
        ?
      </h1>

      <form
        onSubmit={submit}
        className="bg-muted ring-foreground/90 focus-within:ring-space mt-7 flex h-[60px] items-center gap-3 rounded-2xl pr-2.5 pl-5 ring-2"
      >
        <LinkIcon
          className="text-muted-foreground size-[1.125rem] shrink-0"
          aria-hidden
        />
        <input
          type="url"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Paste a link to open it"
          aria-label="Article URL"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[1.0625rem] outline-none"
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-10 rounded-xl px-4"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Open <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
      {state.status === "error" && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive mt-3 rounded-xl px-4 py-3 text-[0.9375rem]"
        >
          {state.message}
        </p>
      )}

      {spaces.length > 0 && (
        <div className="mt-9 grid grid-cols-3 gap-3">
          {spaces.slice(0, 3).map((space) => {
            const on = space.id === active;
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => setActive(space.id)}
                aria-pressed={on}
                className={cn(
                  "bg-muted focus-visible:ring-ring/60 flex h-28 flex-col justify-between rounded-[20px] p-4 text-left outline-none focus-visible:ring-2",
                  on && "ring-space ring-2",
                )}
              >
                <span className="text-[1.125rem] font-extrabold tracking-[-0.02em]">
                  {space.name}
                </span>
                <span className="text-muted-foreground text-[0.8125rem] font-semibold">
                  {space.count} {space.count === 1 ? "article" : "articles"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-8" aria-label="Continue reading">
          <h2 className="text-muted-foreground mb-1.5 text-[0.75rem] font-bold">
            Continue reading
          </h2>
          <ul>
            {recent.map((a) => (
              <li key={a.id} className="border-border border-b">
                <button
                  type="button"
                  onClick={() => void openArticle(a.id)}
                  className="hover:bg-muted/60 focus-visible:ring-ring/60 flex h-11 w-full items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2"
                >
                  <i
                    aria-hidden
                    className="bg-border size-2.5 shrink-0 rounded-[3px]"
                  />
                  <span className="truncate">{a.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[0.8125rem]">
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
        <div className="mt-8 max-w-lg">
          <p className="text-muted-foreground text-[0.9375rem] leading-relaxed">
            Paste a link and it opens as a clean page. Select any passage and
            ask your local Codex agent about it.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void openSampleArticle()}
          >
            Start with a two minute tour
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openSampleArticle()}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-6 rounded text-[0.8125rem] underline underline-offset-4 outline-none focus-visible:ring-2"
        >
          Open the tour again
        </button>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { openSource } from "@/lib/navigate";
import { citedArticles } from "@/lib/sources";
import type { SourceLink as Source } from "@/lib/source-links";
import { sourceHref } from "@/lib/source-links";
import { useLibraryStore } from "@/stores/library-store";

const HINT = "Open in this tab. ⌘-click opens a new tab.";

function open(e: React.MouseEvent, source: Source) {
  e.preventDefault();
  void openSource(source.id, source.block, e.metaKey || e.ctrlKey);
}

/** A saved blog named in an answer, as a button that opens it (at the
 * paragraph the answer points at, when it names one). A link to a blog
 * that is not saved is shown as plain text, never as a dead button. */
export function SourceLink({
  source,
  children,
}: {
  source: Source;
  children: ReactNode;
}) {
  const known = useLibraryStore((s) =>
    s.articles.some((a) => a.id === source.id),
  );
  if (!known) return <>{children}</>;
  return (
    <button
      type="button"
      title={
        source.block === null ? HINT : `Paragraph ${source.block}. ${HINT}`
      }
      onClick={(e) => open(e, source)}
      onAuxClick={(e) =>
        e.button === 1 && void openSource(source.id, source.block, true)
      }
      className="decoration-muted-foreground/60 hover:decoration-foreground focus-visible:ring-ring/60 cursor-pointer rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2"
    >
      {children}
    </button>
  );
}

/** The saved blogs an answer mentions, listed under it as buttons. Blogs the
 * answer already links to are not repeated. */
export function SourceChips({ text }: { text: string }) {
  const articles = useLibraryStore((s) => s.articles);
  const cited = citedArticles(text, articles).filter(
    (a) => !text.includes(`(${sourceHref(a.id)}`),
  );
  if (cited.length === 0) return null;
  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-1.5 text-[0.75rem]">
      <span>Sources</span>
      {cited.map((a) => (
        <button
          key={a.id}
          type="button"
          title={HINT}
          onClick={(e) => open(e, { id: a.id, block: null })}
          className="bg-muted hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 flex max-w-[16rem] items-center gap-1.5 rounded-full px-2.5 py-1 outline-none focus-visible:ring-2"
        >
          <BookOpen className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{a.title}</span>
        </button>
      ))}
    </div>
  );
}

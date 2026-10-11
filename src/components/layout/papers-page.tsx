import { FileText } from "lucide-react";
import { Fetching } from "@/components/layout/fetching";
import { LibraryList } from "@/components/layout/home-library";
import { isPdfUrl } from "@/lib/pdf/identity";
import { pickAndOpenPdf } from "@/lib/pdf/pick";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Research papers: the PDFs imported from this computer, and the way to
 * add one. Papers are read like any blog (comments, Ask, chat). */
export function PapersPage() {
  const state = useReaderStore((s) => s.state);
  const articles = useLibraryStore((s) => s.articles);
  const slots = useSpacesStore((s) => s.slots);
  const loading = state.status === "loading";
  const papers = articles.filter(
    (a) => isPdfUrl(a.canonicalUrl) && !a.archived,
  );

  return (
    <div className="mx-auto w-full max-w-[62rem] px-10 pt-14 pb-32">
      <header>
        <p className="text-muted-foreground text-[0.8125rem]">Research</p>
        <h1 className="font-display mt-1.5 text-[2.25rem] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">
          Papers
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[34rem] text-[0.8125rem]">
          Open a research paper or any PDF from this computer. Yomu reads its
          text, so you can comment on it and ask about it like any blog.
        </p>
      </header>

      <button
        type="button"
        disabled={loading}
        onClick={() => void pickAndOpenPdf()}
        className="border-border hover:bg-muted/60 focus-visible:ring-ring/60 mt-8 flex w-full max-w-[38rem] flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        <FileText className="text-muted-foreground size-7" aria-hidden />
        <span className="text-[0.9375rem] font-medium">Open a PDF</span>
        <span className="text-muted-foreground text-[0.8125rem]">
          Choose a file, or drop one anywhere in the window · {MOD}O
        </span>
      </button>

      {state.status === "loading" && (
        <Fetching url={state.url} detail={state.detail} />
      )}
      {state.status === "error" && (
        <p
          role="alert"
          className="bg-destructive/8 text-destructive mt-4 max-w-[38rem] rounded-lg px-3.5 py-2.5 text-[0.8125rem] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--destructive)_30%,transparent)]"
        >
          {state.message}
        </p>
      )}

      {papers.length === 0 ? (
        !loading && (
          <p className="text-muted-foreground mt-14 text-center text-[0.8125rem]">
            No papers yet.
          </p>
        )
      ) : (
        <div className="mt-10">
          <LibraryList list={papers} archive={false} slots={slots} />
        </div>
      )}
    </div>
  );
}

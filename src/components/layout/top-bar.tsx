import { ChevronLeft, MessageSquare } from "lucide-react";
import { UpdateBanner } from "@/components/layout/update-banner";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

/** The page's own bar, under the tabs: the way back to the library, what you
 * are reading. */
export function TopBar() {
  const reader = useReaderStore((s) => s.state);
  const goHome = useTabsStore((s) => s.goHome);
  const pastTitle = useUiStore((s) => s.pastTitle);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);

  const article = reader.status === "ready" ? reader.article : null;
  const title = article?.title ?? null;

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 pr-2 pl-3.5 text-[0.8125rem]">
      <div className="flex shrink-0 items-center gap-1">
        {title ? (
          <button
            type="button"
            onClick={() => void goHome()}
            aria-label="Back to the library"
            className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-1 rounded-md px-1.5 outline-none focus-visible:ring-2"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Library
          </button>
        ) : (
          <span className="px-1.5 font-medium">Library</span>
        )}
      </div>

      <p
        className={
          "text-muted-foreground min-w-0 flex-1 truncate text-center font-serif text-[0.8125rem] transition-opacity duration-[var(--dur)] " +
          (pastTitle ? "opacity-100" : "opacity-0")
        }
        title={title ?? undefined}
      >
        {title}
      </p>

      <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <UpdateBanner />
        {article && (
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            aria-pressed={chatOpen}
            className={
              "hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2 rounded-md px-2.5 outline-none focus-visible:ring-2 " +
              (chatOpen ? "bg-accent text-foreground" : "text-muted-foreground")
            }
          >
            <MessageSquare className="size-4" aria-hidden />
            Chat
          </button>
        )}
      </div>
    </header>
  );
}

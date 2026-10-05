import {
  ChevronLeft,
  FolderPlus,
  MessageSquare,
  Moon,
  PanelLeft,
  Sun,
} from "lucide-react";
import { CollectionPicker } from "@/components/layout/collection-picker";
import { UpdateBanner } from "@/components/layout/update-banner";
import { goHome } from "@/lib/navigate";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";

const ICON_BUTTON =
  "text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-2";

/** The page's own bar: the sidebar toggle, the way back to Home, what
 * you are reading, and the theme. */
export function TopBar() {
  const reader = useReaderStore((s) => s.state);
  const pastTitle = useUiStore((s) => s.pastTitle);
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const article = reader.status === "ready" ? reader.article : null;
  const title = article?.title ?? null;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-2 text-[0.8125rem]">
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
          onMouseLeave={() => peekSidebar(false)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          className={ICON_BUTTON}
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
        {title ? (
          <button
            type="button"
            onClick={() => void goHome()}
            aria-label="Back to Home"
            className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-1 rounded-md px-1.5 outline-none focus-visible:ring-2"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Home
          </button>
        ) : (
          <span className="px-1.5 font-medium">Home</span>
        )}
      </div>

      <p
        className={
          "text-muted-foreground min-w-0 flex-1 truncate text-center text-[0.8125rem] transition-opacity duration-[var(--dur)] " +
          (pastTitle ? "opacity-100" : "opacity-0")
        }
        title={title ?? undefined}
      >
        {title}
      </p>

      <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <UpdateBanner />
        {article && (
          <CollectionPicker
            articleId={article.id}
            trigger={
              <button
                type="button"
                aria-label="Save to a collection"
                title="Save to a collection"
                className={ICON_BUTTON}
              >
                <FolderPlus className="size-4" aria-hidden />
              </button>
            }
          />
        )}
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
        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          aria-label={dark ? "Use the light theme" : "Use the dark theme"}
          title={dark ? "Light theme" : "Dark theme"}
          className={ICON_BUTTON}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}

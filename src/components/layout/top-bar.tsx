import {
  ChevronLeft,
  FolderPlus,
  MessageSquare,
  Moon,
  PanelLeft,
  Sun,
} from "lucide-react";
import { ArticleMenu } from "@/components/layout/article-menu";
import { CollectionPicker } from "@/components/layout/collection-picker";
import { IconButton } from "@/components/ui/icon-button";
import { UpdateBanner } from "@/components/layout/update-banner";
import { resolveTheme } from "@/lib/appearance";
import { MOD } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { goHome } from "@/lib/navigate";
import { TabStrip } from "@/components/layout/tab-strip";
import { useTabsStore } from "@/stores/tabs";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";
import { useUiStore } from "@/stores/ui-store";

/** The page's own bar: the sidebar toggle, the way back to Home, what
 * you are reading, the article's actions, and the theme. Its empty parts
 * drag the window (the title bar is hidden on macOS). */
export function TopBar() {
  const reader = useReaderStore((s) => s.state);
  const pastTitle = useViewStore((s) => s.pastTitle);
  const chatOpen = useViewStore((s) => s.chatOpen);
  const setChatOpen = useViewStore((s) => s.setChatOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  // The sun/moon button switches to the theme's light or dark partner
  // (Catppuccin Mocha <-> Latte, Gruvbox Dark <-> Light, ...).
  const shown = resolveTheme(
    theme,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark = shown.mode === "dark";

  const tabbed = useTabsStore((s) => s.ids.length > 1);
  const article = reader.status === "ready" ? reader.article : null;
  const title = article?.title ?? null;

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "text-ui flex h-11 shrink-0 items-center gap-2 pr-2 pl-2",
        // With the sidebar closed, the macOS window buttons sit over this
        // bar's left end.
        !sidebarOpen && "[.platform-mac_&]:pl-[78px]",
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          label={
            sidebarOpen
              ? `Collapse sidebar (${MOD}B)`
              : `Open sidebar (${MOD}B)`
          }
          onClick={() => setSidebarOpen(!sidebarOpen)}
          onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
          onMouseLeave={() => peekSidebar(false)}
          aria-expanded={sidebarOpen}
        >
          <PanelLeft aria-hidden />
        </IconButton>
        {!tabbed &&
          (title ? (
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
          ))}
      </div>

      {/* With several tabs, the tabs are the header: they say what each page
          is, so the back button and the title are not repeated. */}
      {tabbed ? (
        <TabStrip />
      ) : (
        <p
          data-tauri-drag-region
          className={
            "text-muted-foreground text-ui min-w-0 flex-1 truncate text-center transition-opacity duration-[var(--dur)] " +
            (pastTitle ? "opacity-100" : "opacity-0")
          }
          title={title ?? undefined}
        >
          {title}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <UpdateBanner />
        {article && (
          <CollectionPicker
            articleId={article.id}
            trigger={
              <IconButton label="Add to a collection">
                <FolderPlus aria-hidden />
              </IconButton>
            }
          />
        )}
        {article && (
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            aria-pressed={chatOpen}
            title={`${chatOpen ? "Hide" : "Show"} the chat (${MOD}E)`}
            className={
              "hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2 rounded-md px-2.5 outline-none focus-visible:ring-2 " +
              (chatOpen ? "bg-accent text-foreground" : "text-muted-foreground")
            }
          >
            <MessageSquare className="size-4" aria-hidden />
            Chat
          </button>
        )}
        {article && <ArticleMenu article={article} />}
        <IconButton
          label={dark ? "Use the light theme" : "Use the dark theme"}
          onClick={() => setTheme(shown.pair)}
        >
          {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </IconButton>
      </div>
    </header>
  );
}

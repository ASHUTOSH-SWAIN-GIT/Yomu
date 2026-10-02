import { ChevronLeft, Moon, Search, Sun } from "lucide-react";
import { usesOverlayTitleBar } from "@/lib/platform";
import { UpdateBanner } from "@/components/layout/update-banner";
import { ArticleTools } from "@/components/reader/article-tools";
import { ReaderSettings } from "@/components/reader/reader-settings";
import { useAgentStore } from "@/stores/agent-store";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useUiStore } from "@/stores/ui-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The only chrome: the way back to the library, what you are reading, and
 * search. It is also the window's title bar (drag region, and room for the
 * macOS window controls). */
export function TopBar() {
  const reader = useReaderStore((s) => s.state);
  const goHome = useTabsStore((s) => s.goHome);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const agentStatus = useAgentStore((s) => s.status);
  const pastTitle = useUiStore((s) => s.pastTitle);

  const article = reader.status === "ready" ? reader.article : null;
  const title = article?.title ?? null;

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-3 pr-2 text-[0.8125rem]"
      style={{ paddingLeft: usesOverlayTitleBar() ? "5.5rem" : "0.875rem" }}
    >
      <div data-tauri-drag-region className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void goHome()}
          aria-current={title ? undefined : "page"}
          aria-label={title ? "Back to the library" : "Yomu library"}
          className="hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2 rounded-lg px-1.5 outline-none focus-visible:ring-2"
        >
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-[6px] font-serif text-[0.6875rem] font-semibold"
          >
            読
          </span>
          {title ? (
            <span className="text-muted-foreground flex items-center gap-1 pr-1">
              <ChevronLeft className="size-3.5" aria-hidden />
              Library
            </span>
          ) : (
            <span className="font-display pr-1 text-[0.9375rem] font-semibold tracking-[-0.01em]">
              Yomu
            </span>
          )}
        </button>
      </div>

      <p
        data-tauri-drag-region
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
        {article && <ArticleTools article={article} />}
        {article && agentStatus !== "ready" && (
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2 rounded-lg px-2.5 outline-none focus-visible:ring-2"
          >
            <span aria-hidden className="bg-honey size-1.5 rounded-full" />
            {agentStatus === "checking" ? "Checking Codex…" : "Set up Explain"}
          </button>
        )}
        {article && <span aria-hidden className="bg-border mx-1 h-5 w-px" />}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="bg-background text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mr-0.5 flex h-8 w-52 items-center gap-2 rounded-lg px-2.5 shadow-[var(--shadow-card)] outline-none focus-visible:ring-2"
        >
          <Search className="size-3.5" aria-hidden />
          Search or jump to…
          <kbd className="bg-muted ml-auto rounded px-1.5 py-px font-sans text-[0.6875rem]">
            {MOD}K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          aria-label={dark ? "Use the light theme" : "Use the dark theme"}
          title={dark ? "Light theme" : "Dark theme"}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 grid size-8 place-items-center rounded-lg outline-none focus-visible:ring-2"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <ReaderSettings />
      </div>
    </header>
  );
}

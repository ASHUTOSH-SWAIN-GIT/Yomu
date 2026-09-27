import { usesOverlayTitleBar } from "@/lib/platform";
import { UpdateBanner } from "@/components/layout/update-banner";
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

  const title = reader.status === "ready" ? reader.article.title : null;

  return (
    <header
      data-tauri-drag-region
      className="border-border flex h-10 shrink-0 items-center gap-4 border-b pr-2 text-[0.75rem]"
      style={{ paddingLeft: usesOverlayTitleBar() ? "5.5rem" : "0.75rem" }}
    >
      <div data-tauri-drag-region className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => void goHome()}
          aria-current={title ? undefined : "page"}
          className="focus-visible:ring-ring/60 flex items-center gap-2 rounded px-1 py-0.5 font-semibold tracking-[-0.01em] outline-none focus-visible:ring-1"
        >
          <span
            aria-hidden
            className="bg-foreground text-background grid size-[18px] place-items-center rounded-[4px] text-[0.625rem] font-bold"
          >
            読
          </span>
          {title ? (
            <span className="text-muted-foreground hover:text-foreground font-normal">
              Library
            </span>
          ) : (
            "Yomu"
          )}
        </button>
      </div>

      <p
        data-tauri-drag-region
        className="text-muted-foreground min-w-0 flex-1 truncate text-center"
        title={title ?? undefined}
      >
        {title}
      </p>

      <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <UpdateBanner />
        {agentStatus !== "ready" && (
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex h-7 items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-1"
          >
            <span
              aria-hidden
              className="ring-muted-foreground size-1.5 rounded-full ring-1"
            />
            {agentStatus === "checking" ? "Checking Codex…" : "Set up Explain"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="text-muted-foreground hover:text-foreground hover:border-input border-border focus-visible:ring-ring/60 flex h-7 items-center gap-3 rounded-md border px-2.5 outline-none focus-visible:ring-1"
        >
          Search
          <kbd className="font-sans text-[0.6875rem] opacity-70">{MOD}K</kbd>
        </button>
        <ReaderSettings />
      </div>
    </header>
  );
}

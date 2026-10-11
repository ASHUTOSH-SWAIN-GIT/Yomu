import { Plus, X } from "lucide-react";
import { useStore } from "zustand";
import { IconButton } from "@/components/ui/icon-button";
import { MOD } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  activateTab,
  bundleOf,
  closeTab,
  openTab,
  partOf,
  useTabsStore,
} from "@/stores/tabs";

/** The tabs, which are the page's header once there is more than one (⌘T
 * opens another). */
export function TabStrip() {
  const ids = useTabsStore((s) => s.ids);
  const activeId = useTabsStore((s) => s.activeId);
  return (
    <div
      data-tauri-drag-region
      role="tablist"
      aria-label="Tabs"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      {ids.map((id) => (
        <Tab key={id} id={id} active={id === activeId} />
      ))}
      <IconButton
        label={`New tab (${MOD}T)`}
        size="md"
        onClick={() => openTab()}
        className="[&_svg]:size-4"
      >
        <Plus aria-hidden />
      </IconButton>
    </div>
  );
}

function Tab({ id, active }: { id: string; active: boolean }) {
  const title = useTabTitle(id);
  return (
    <div
      className={cn(
        "group text-ui flex h-7 w-44 shrink-0 items-center rounded-md",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={title}
        onClick={() => activateTab(id)}
        onAuxClick={(e) => e.button === 1 && closeTab(id)}
        className="focus-visible:ring-ring/60 h-full min-w-0 flex-1 truncate rounded-md pr-1 pl-2.5 text-left outline-none focus-visible:ring-2"
      >
        {title}
      </button>
      <IconButton
        label={`Close ${title}`}
        size="sm"
        onClick={() => closeTab(id)}
        className={cn(
          "mr-1 size-5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-transparent focus-visible:opacity-100",
          active && "opacity-100",
        )}
      >
        <X aria-hidden />
      </IconButton>
    </div>
  );
}

/** What a tab is showing, in a few words. */
function useTabTitle(id: string): string {
  const bundle = bundleOf(id);
  const reader = useStore(partOf(bundle, "reader"), (s) => s.state);
  const view = useStore(partOf(bundle, "view"));
  const chat = useStore(partOf(bundle, "libraryChat"), (s) =>
    s.chats.find((c) => c.id === s.chatId),
  );
  if (reader.status === "ready") return reader.article.title || "Untitled";
  if (view.settingsPage) return "Settings";
  if (view.libraryChat) return chat?.title ?? "New chat";
  if (view.showArchive) return "Archive";
  return "Home";
}

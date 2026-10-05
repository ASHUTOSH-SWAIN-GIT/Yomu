import { useMemo } from "react";
import { Archive, Home, Plus, X } from "lucide-react";
import { buildSpaces, INBOX } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useUiStore } from "@/stores/ui-store";

/** The library's navigation, on the window frame beside the page: Home, your
 * collections, the archive, and the way to add a collection. */
export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const showArchive = useSpacesStore((s) => s.showArchive);
  const setShowArchive = useSpacesStore((s) => s.setShowArchive);
  const creating = useSpacesStore((s) => s.creating);
  const setCreating = useSpacesStore((s) => s.setCreating);
  const deleteSpace = useSpacesStore((s) => s.deleteSpace);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const peek = useUiStore((s) => s.sidebarPeek);
  const peekSidebar = useUiStore((s) => s.peekSidebar);
  const shown = sidebarOpen || peek;

  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, active),
    [articles, extra, slots, active],
  );
  // Removing a collection keeps its articles: they just lose the tag and show
  // on Home again.
  async function removeCollection(id: string) {
    const tagged = articles.filter((a) => a.tags.includes(id));
    await Promise.all(tagged.map((a) => removeTag(a.id, id)));
    deleteSpace(id);
  }

  const archived = articles.filter((a) => a.archived).length;
  const named = spaces.filter((s) => s.id !== INBOX);

  return (
    <nav
      aria-label="Collections"
      inert={!shown}
      onMouseEnter={() => !sidebarOpen && peekSidebar(true)}
      onMouseLeave={() => peekSidebar(false)}
      className={cn(
        "bg-frame border-border flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-2 pt-2 pb-3 text-[0.8125rem]",
        // Collapsed: parked off-screen over the page, slid in on hover. The
        // shadow rides the same transition so it fades with the slide.
        !sidebarOpen &&
          "absolute inset-y-0 left-0 z-30 transition-[translate,box-shadow,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[translate]",
        !sidebarOpen &&
          (peek
            ? "shadow-[var(--shadow-float)]"
            : "invisible -translate-x-full shadow-none"),
      )}
    >
      <Item
        on={!showArchive && !creating && active === INBOX}
        onClick={() => setActive(INBOX)}
        icon={<Home />}
      >
        Home
      </Item>

      <h2 className="text-foreground mt-5 mb-1 px-2.5 text-[0.8125rem] font-bold">
        My collection
      </h2>
      <Item on={creating} onClick={() => setCreating(true)} icon={<Plus />}>
        New collection
      </Item>
      {named.map((space) => (
        <div key={space.id} className="group relative flex flex-col">
          <Item
            on={!showArchive && !creating && active === space.id}
            onClick={() => setActive(space.id)}
            icon={
              <i
                className="mx-[3px] block size-2.5 rounded-full"
                style={{
                  background:
                    space.slot === null
                      ? "var(--sp-inbox)"
                      : `var(--sp-${space.slot})`,
                }}
              />
            }
            count={space.count}
          >
            {space.name}
          </Item>
          <button
            type="button"
            onClick={() => void removeCollection(space.id)}
            aria-label={`Remove ${space.name}`}
            title="Remove collection (articles are kept)"
            className="text-muted-foreground hover:text-foreground bg-accent focus-visible:ring-ring/60 absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-sm opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}

      {archived > 0 && (
        <>
          <div className="mt-5" />
          <Item
            on={showArchive}
            onClick={() => setShowArchive(true)}
            icon={<Archive />}
            count={archived}
          >
            Archive
          </Item>
        </>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left text-[0.75rem] outline-none focus-visible:ring-2"
        >
          <span
            aria-hidden
            className={cn(
              "mx-[5px] size-1.5 rounded-full",
              agentStatus === "ready"
                ? "bg-[var(--sp-1)]"
                : agentStatus === "checking"
                  ? "bg-muted-foreground animate-pulse"
                  : "bg-honey",
            )}
          />
          {agentStatus === "ready"
            ? "Codex connected"
            : agentStatus === "checking"
              ? "Checking Codex…"
              : "Set up Explain"}
        </button>
      </div>
    </nav>
  );
}

function Item({
  on,
  onClick,
  icon,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/60 flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-left outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        on
          ? "bg-accent text-foreground font-medium"
          : "text-foreground/80 hover:bg-accent/70 hover:text-foreground [&>svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span className="text-muted-foreground text-[0.6875rem] font-normal tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

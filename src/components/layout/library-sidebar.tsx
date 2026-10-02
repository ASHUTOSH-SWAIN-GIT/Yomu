import { useMemo, useState } from "react";
import { Archive, BookOpen, Inbox, Plus } from "lucide-react";
import { buildSpaces, INBOX } from "@/lib/spaces";
import { openSampleArticle } from "@/lib/sample-article";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";
import { useUiStore } from "@/stores/ui-store";

/** The library's spaces, on the window frame beside the sheet: Inbox, your
 * spaces with their colours, the archive, and the way to add a space. */
export function LibrarySidebar() {
  const articles = useLibraryStore((s) => s.articles);
  const active = useSpacesStore((s) => s.active);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const setActive = useSpacesStore((s) => s.setActive);
  const showArchive = useSpacesStore((s) => s.showArchive);
  const setShowArchive = useSpacesStore((s) => s.setShowArchive);
  const createSpace = useSpacesStore((s) => s.createSpace);
  const agentStatus = useAgentStore((s) => s.status);
  const setSetupOpen = useUiStore((s) => s.setSetupOpen);
  const [naming, setNaming] = useState(false);

  const spaces = useMemo(
    () => buildSpaces(articles, extra, slots, active),
    [articles, extra, slots, active],
  );
  const archived = articles.filter((a) => a.archived).length;
  const inbox = spaces.find((s) => s.id === INBOX);
  const named = spaces.filter((s) => s.id !== INBOX);

  return (
    <nav
      aria-label="Spaces"
      className="flex w-[13.5rem] shrink-0 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-3 text-[0.8125rem]"
    >
      <Item
        on={!showArchive && active === INBOX}
        onClick={() => setActive(INBOX)}
        icon={<Inbox />}
        count={inbox?.count ?? 0}
      >
        Inbox
      </Item>

      <h2 className="text-muted-foreground mt-5 mb-1 px-2.5 text-[0.6875rem] font-medium">
        Spaces
      </h2>
      {named.map((space) => (
        <Item
          key={space.id}
          on={!showArchive && active === space.id}
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
      ))}
      {naming ? (
        <NewSpace
          onDone={(name) => {
            setNaming(false);
            if (name) createSpace(name);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left outline-none focus-visible:ring-2 [&>svg]:size-4"
        >
          <Plus aria-hidden />
          New space
        </button>
      )}

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
        <Item
          on={false}
          onClick={() => void openSampleArticle()}
          icon={<BookOpen />}
        >
          Take the tour
        </Item>
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring/60 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.75rem] outline-none focus-visible:ring-2"
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
        "focus-visible:ring-ring/60 flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        on
          ? "bg-background text-foreground font-medium shadow-[var(--shadow-card)]"
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

function NewSpace({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
      className="px-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        onBlur={() => onDone(value.trim() || null)}
        placeholder="Name your space"
        aria-label="New space name"
        maxLength={32}
        className="bg-background placeholder:text-muted-foreground focus:ring-ring/60 h-8 w-full rounded-lg px-2 shadow-[var(--shadow-card)] outline-none focus:ring-2"
      />
    </form>
  );
}

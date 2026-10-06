import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { agentSetModel } from "@/lib/commands";
import { logError } from "@/lib/log";
import {
  defaultVariant,
  groupModels,
  type ModelEntry,
} from "@/lib/model-groups";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useModelsStore } from "@/stores/models-store";
import { useUiStore } from "@/stores/ui-store";

// A provider with more models than this starts folded; searching opens it.
const FOLD_ABOVE = 25;

/** "Which model answers": a small button at the bottom right of the message
 * box. It lists only the models your account or sign-ins let you use (the
 * agent reports exactly those), grouped by provider, with a model's
 * reasoning efforts as small buttons under it. Picking one moves the chat
 * that is open to it and is used for new chats too. */
export function ModelPicker() {
  const chosen = useUiStore((s) => s.chatModel);
  const setChosen = useUiStore((s) => s.setChatModel);
  const [open, setOpen] = useState(false);
  // What the agent in use offers; the customize page clears it when the agent changes.
  const models = useModelsStore((s) => s.models);
  const failed = useModelsStore((s) => s.failed);
  const load = useModelsStore((s) => s.load);
  const [query, setQuery] = useState("");
  // Providers the user opened or folded by hand; the rest follow the default.
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const sections = useMemo(() => groupModels(models ?? []), [models]);
  const total = sections.reduce((n, s) => n + s.entries.length, 0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setQuery("");
    if (next) void load();
  }

  function pick(id: string | null) {
    setChosen(id);
    setOpen(false);
    if (!id) return; // Auto: takes effect for the next new chat.
    // Move whichever chats are open right now.
    for (const sessionId of [
      useChatStore.getState().sessionId,
      useLibraryChatStore.getState().sessionId,
    ]) {
      if (sessionId) {
        agentSetModel(sessionId, id).catch((err) =>
          logError("switching model failed", err),
        );
      }
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (entry: ModelEntry, section: string | null) =>
    !q ||
    `${section ?? ""} ${entry.title} ${entry.description}`
      .toLowerCase()
      .includes(q);

  // What the button says: the model, and its effort when it has several.
  let label = "Auto";
  if (chosen) {
    label = chosen;
    for (const section of sections) {
      for (const entry of section.entries) {
        const variant = entry.variants.find((v) => v.id === chosen);
        if (!variant) continue;
        label =
          entry.variants.length > 1
            ? `${entry.title} · ${variant.label}`
            : entry.title;
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose the model"
          title="Choose the model"
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 flex h-8 max-w-48 items-center gap-1 rounded-full px-2.5 text-[0.75rem] outline-none focus-visible:ring-2"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="flex max-h-96 w-80 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        {total > 8 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${total} models`}
            aria-label="Search models"
            autoFocus
            className="bg-muted placeholder:text-muted-foreground mb-1 h-8 shrink-0 rounded-lg px-2.5 text-[0.8125rem] outline-none"
          />
        )}
        <Row
          on={!chosen}
          title="Auto"
          description="Yomu picks a model you can use."
          onClick={() => pick(null)}
        />
        {!models && !failed && (
          <p className="text-muted-foreground px-2.5 py-2 text-[0.8125rem]">
            Loading models…
          </p>
        )}
        {failed && (
          <p className="text-destructive px-2.5 py-2 text-[0.8125rem]">
            Could not load the models. Is the agent set up?
          </p>
        )}
        {sections.map((section) => {
          const entries = section.entries.filter((e) =>
            matches(e, section.title),
          );
          if (entries.length === 0) return null;
          const key = section.title ?? "";
          const foldedByDefault = section.entries.length > FOLD_ABOVE;
          // Folded by default when huge, flipped by a click; a search opens
          // everything that matches.
          const folded =
            !q && foldedByDefault !== toggled.has(key) && !!section.title;
          return (
            <div key={key} className="flex flex-col gap-0.5">
              {section.title && (
                <button
                  type="button"
                  onClick={() =>
                    setToggled((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(key)) next.add(key);
                      return next;
                    })
                  }
                  aria-expanded={!folded}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[0.6875rem] font-semibold tracking-wide uppercase outline-none focus-visible:ring-2"
                >
                  <ChevronRight
                    className={cn(
                      "size-3 transition-transform",
                      !folded && "rotate-90",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{section.title}</span>
                  <span className="font-normal tabular-nums">
                    {section.entries.length}
                  </span>
                </button>
              )}
              {!folded &&
                entries.map((entry) => {
                  const current = entry.variants.find((v) => v.id === chosen);
                  return (
                    <Row
                      key={entry.key}
                      on={!!current}
                      title={entry.title}
                      description={entry.description}
                      onClick={() => pick(defaultVariant(entry))}
                    >
                      {entry.variants.length > 1 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {entry.variants.map((v) => (
                            <span
                              key={v.id}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                pick(v.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  pick(v.id);
                                }
                              }}
                              className={cn(
                                "focus-visible:ring-ring/60 rounded-full px-2 py-0.5 text-[0.6875rem] outline-none focus-visible:ring-2",
                                current?.id === v.id
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {v.label}
                            </span>
                          ))}
                        </span>
                      )}
                    </Row>
                  );
                })}
            </div>
          );
        })}
        {models &&
          q &&
          sections.every(
            (s) => !s.entries.some((e) => matches(e, s.title)),
          ) && (
            <p className="text-muted-foreground px-2.5 py-2 text-[0.8125rem]">
              No model matches.
            </p>
          )}
      </PopoverContent>
    </Popover>
  );
}

function Row({
  on,
  title,
  description,
  onClick,
  children,
}: {
  on: boolean;
  title: string;
  description: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    // A div, not a button: the effort buttons inside it are buttons too.
    <div
      role="menuitemradio"
      aria-checked={on}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring/60 flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2",
        on && "bg-accent/60",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.8125rem] font-medium">{title}</span>
        {description && (
          <span className="text-muted-foreground line-clamp-2 text-[0.6875rem] leading-snug">
            {description}
          </span>
        )}
        {children}
      </span>
      <Check
        className={cn("mt-0.5 size-3.5 shrink-0", !on && "invisible")}
        aria-hidden
      />
    </div>
  );
}

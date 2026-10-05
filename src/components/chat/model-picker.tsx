import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { agentListModels, agentSetModel } from "@/lib/commands";
import { logError } from "@/lib/log";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useUiStore } from "@/stores/ui-store";
import type { AgentModel } from "@/types/agent";

// The list only changes with the account, so ask the agent once.
let cached: AgentModel[] | null = null;

/** "Which model answers": a small button at the bottom right of the message
 * box that lists the models the account can use. Picking one moves the chat
 * that is open to it and is used for new chats too. */
export function ModelPicker() {
  const chosen = useUiStore((s) => s.chatModel);
  const setChosen = useUiStore((s) => s.setChatModel);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AgentModel[] | null>(cached);
  const [failed, setFailed] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next || cached) return;
    setFailed(false);
    agentListModels()
      .then((list) => {
        cached = list;
        setModels(list);
      })
      .catch((err) => {
        logError("listing models failed", err);
        setFailed(true);
      });
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

  const label = chosen
    ? (models?.find((m) => m.id === chosen)?.name ?? chosen)
    : "Auto";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose the model"
          title="Choose the model"
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 flex h-8 max-w-44 items-center gap-1 rounded-full px-2.5 text-[0.75rem] outline-none focus-visible:ring-2"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        <Option
          on={!chosen}
          title="Auto"
          description="Yomu picks a model your account can use."
          onClick={() => pick(null)}
        />
        {!models && !failed && (
          <p className="text-muted-foreground px-2.5 py-2 text-[0.8125rem]">
            Loading models…
          </p>
        )}
        {failed && (
          <p className="text-destructive px-2.5 py-2 text-[0.8125rem]">
            Could not load the models. Is Codex set up?
          </p>
        )}
        {models?.map((m) => (
          <Option
            key={m.id}
            on={chosen === m.id}
            title={m.name}
            description={m.description}
            onClick={() => pick(m.id)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Option({
  on,
  title,
  description,
  onClick,
}: {
  on: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring/60 flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2",
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
      </span>
      <Check
        className={cn("mt-0.5 size-3.5 shrink-0", !on && "invisible")}
        aria-hidden
      />
    </button>
  );
}

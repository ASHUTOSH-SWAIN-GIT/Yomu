import { type FormEvent, type Ref, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";
import { matchCommands, type SlashCommand } from "@/lib/slash-commands";
import { cn } from "@/lib/utils";

/** The message box shared by both chats: the text on top, and at the bottom
 * right the model picker and the send (or stop) button. It has no border;
 * it is just a slightly lighter surface. */
export function Composer({
  id,
  textareaRef,
  value,
  onChange,
  onSend,
  onStop,
  onSetup,
  streaming,
  ready,
  placeholder,
  autoFocus,
  tall,
  commands = [],
}: {
  id: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onSetup: () => void;
  streaming: boolean;
  ready: boolean;
  placeholder: string;
  autoFocus?: boolean;
  /** The big box on an empty page. */
  tall?: boolean;
  /** Shortcuts offered when the text starts with a slash. */
  commands?: SlashCommand[];
}) {
  const [cursor, setCursor] = useState(0);
  const matches = ready ? matchCommands(value, commands) : [];
  const at = Math.min(cursor, Math.max(matches.length - 1, 0));
  function pick(command: SlashCommand) {
    onChange("");
    setCursor(0);
    onSend(command.text);
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSend(value);
  }
  const round =
    "mb-0.5 grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <form onSubmit={onSubmit} className="relative w-full">
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Commands"
          className="bg-popover text-popover-foreground border-border absolute right-0 bottom-full left-0 z-10 mb-2 rounded-2xl border p-1 shadow-[var(--shadow-float)]"
        >
          {matches.map((c, i) => (
            <li key={c.name} role="option" aria-selected={i === at}>
              <button
                type="button"
                // The text box keeps focus while one is picked.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left text-[0.8125rem] outline-none",
                  i === at ? "bg-accent" : "hover:bg-accent/70",
                )}
              >
                <span className="font-medium">/{c.name}</span>
                <span className="text-muted-foreground">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="bg-muted flex flex-col rounded-3xl px-4 pt-3 pb-2">
        <textarea
          id={id}
          ref={textareaRef}
          autoFocus={autoFocus}
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (matches.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setCursor((at + step + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[at]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onChange("");
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(value);
            }
          }}
          disabled={!ready}
          placeholder={placeholder}
          aria-label="Message"
          className={cn(
            "placeholder:text-muted-foreground field-sizing-content max-h-52 min-h-8 w-full resize-none bg-transparent text-[0.9375rem] leading-6 outline-none disabled:opacity-60",
            tall && "min-h-16",
          )}
        />
        <div className="mt-1 flex items-center justify-end gap-1">
          <ModelPicker />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className={cn(round, "bg-primary text-primary-foreground")}
            >
              <Square className="size-3 fill-current" aria-hidden />
            </button>
          ) : ready ? (
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Send"
              className={cn(
                round,
                "bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground",
              )}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSetup}
              className="bg-primary text-primary-foreground focus-visible:ring-ring/60 mb-0.5 h-8 shrink-0 rounded-full px-3.5 text-[0.75rem] font-medium outline-none focus-visible:ring-2"
            >
              Set up
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

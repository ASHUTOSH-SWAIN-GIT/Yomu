import { type FormEvent, type Ref } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";
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
}) {
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSend(value);
  }
  const round =
    "mb-0.5 grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="bg-muted flex flex-col rounded-3xl px-4 pt-3 pb-2">
        <textarea
          id={id}
          ref={textareaRef}
          autoFocus={autoFocus}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
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

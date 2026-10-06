import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Group, Option } from "@/components/settings/picker-parts";
import { FONT_KINDS, FONTS, type ReaderFont } from "@/lib/fonts";
import { useUiStore } from "@/stores/ui-store";

/** The typeface dropdown: sans, serif and mono faces. The sample under it in
 * Settings shows the one chosen. */
export function FontPicker() {
  const font = useUiStore((s) => s.reader.font);
  const setReader = useUiStore((s) => s.setReader);
  const [open, setOpen] = useState(false);
  const current = FONTS.find((f) => f.id === font) ?? FONTS[0];

  function pick(next: ReaderFont) {
    setReader({ font: next });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Typeface"
          className="bg-muted hover:bg-accent focus-visible:ring-ring/60 flex h-9 w-60 items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] outline-none focus-visible:ring-2"
        >
          <span className="min-w-0 flex-1 truncate">{current.label}</span>
          <span className="text-muted-foreground text-[0.75rem]">
            {current.kind}
          </span>
          <ChevronDown
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(28rem,70vh)] w-64 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        {FONT_KINDS.map((kind) => (
          <div key={kind} className="flex flex-col gap-0.5">
            <Group title={kind} />
            {FONTS.filter((f) => f.kind === kind).map((f) => (
              <Option
                key={f.id}
                on={font === f.id}
                label={f.label}
                swatch={null}
                onClick={() => pick(f.id)}
              />
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

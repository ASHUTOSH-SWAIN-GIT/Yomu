import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Group, Option } from "@/components/settings/picker-parts";
import { resolveTheme, type Theme } from "@/lib/appearance";
import { THEMES, type ThemeMeta } from "@/lib/themes";
import { useUiStore } from "@/stores/ui-store";

/** The theme dropdown: Auto, then the light themes, then the dark ones,
 * each with a small picture of its colours. */
export function ThemePicker() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);

  const current =
    theme === "system" ? null : (THEMES.find((t) => t.id === theme) ?? null);

  function pick(next: Theme) {
    setTheme(next);
    setOpen(false);
  }

  const light = THEMES.filter((t) => t.mode === "light");
  const dark = THEMES.filter((t) => t.mode === "dark");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Theme"
          className="bg-muted hover:bg-accent focus-visible:ring-ring/60 flex h-9 w-60 items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] outline-none focus-visible:ring-2"
        >
          {current ? <Swatch theme={current} /> : <AutoSwatch />}
          <span className="min-w-0 flex-1 truncate">
            {current ? current.label : "Auto"}
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
        <Option
          on={theme === "system"}
          label="Auto"
          note="Follows your Mac"
          swatch={<AutoSwatch />}
          onClick={() => pick("system")}
        />
        <Group title="Light" />
        {light.map((t) => (
          <Option
            key={t.id}
            on={theme === t.id}
            label={t.label}
            swatch={<Swatch theme={t} />}
            onClick={() => pick(t.id)}
          />
        ))}
        <Group title="Dark" />
        {dark.map((t) => (
          <Option
            key={t.id}
            on={theme === t.id}
            label={t.label}
            swatch={<Swatch theme={t} />}
            onClick={() => pick(t.id)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A tiny window in the theme's colours: the sidebar strip, the page, a line
 * of text and the accent. Drawn from the theme's own palette, so it looks
 * right whatever theme is showing around it. */
function Swatch({ theme }: { theme: ThemeMeta }) {
  const { bg, frame, fg, accent } = theme.swatch;
  return (
    <span
      aria-hidden
      className="relative flex h-5 w-7 shrink-0 overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgb(127_127_127/0.35)]"
      style={{ background: bg }}
    >
      <span className="h-full w-2" style={{ background: frame }} />
      <span className="flex flex-1 flex-col justify-center gap-[3px] px-[3px]">
        <span
          className="h-[2px] w-full rounded-full"
          style={{ background: fg }}
        />
        <span
          className="h-[2px] w-2/3 rounded-full"
          style={{ background: accent }}
        />
      </span>
    </span>
  );
}

/** Half Yomu Light, half Yomu Dark. */
function AutoSwatch() {
  const light = resolveTheme("light", false);
  const dark = resolveTheme("dark", true);
  return (
    <span
      aria-hidden
      className="flex h-5 w-7 shrink-0 overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgb(127_127_127/0.35)]"
    >
      <span className="flex-1" style={{ background: light.swatch.bg }} />
      <span className="flex-1" style={{ background: dark.swatch.bg }} />
    </span>
  );
}

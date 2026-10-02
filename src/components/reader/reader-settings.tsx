import { Focus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import type { CodeExamplePref, ExplainLevel } from "@/lib/explain-prefs";
import { useUiStore, type Theme } from "@/stores/ui-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The "Aa" menu: how the article is set (typeface, size, width), the theme,
 * and view options. Everything is remembered between sessions. */
export function ReaderSettings() {
  const reader = useUiStore((s) => s.reader);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setReader = useUiStore((s) => s.setReader);
  const blockImages = useUiStore((s) => s.blockRemoteImages);
  const setBlockImages = useUiStore((s) => s.setBlockRemoteImages);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const explainPrefs = useUiStore((s) => s.explainPrefs);
  const setExplainPrefs = useUiStore((s) => s.setExplainPrefs);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-accent/70 size-8 gap-0 px-0"
          aria-label="Reading settings"
        >
          <span className="font-serif text-base leading-none">A</span>
          <span className="font-serif text-xs leading-none">a</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[22rem] flex-col gap-2.5">
        <Row label="Theme">
          <Segmented<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Page" },
              { value: "paper", label: "Paper" },
              { value: "dark", label: "Night" },
              { value: "system", label: "Auto" },
            ]}
          />
        </Row>
        <Row label="Typeface">
          <Segmented
            label="Typeface"
            value={reader.font}
            onChange={(font) => setReader({ font })}
            options={[
              {
                value: "serif",
                label: <span className="font-serif">Serif</span>,
              },
              { value: "sans", label: "Sans" },
            ]}
          />
        </Row>
        <Row label="Text size">
          <Segmented
            label="Text size"
            value={reader.size}
            onChange={(size) => setReader({ size })}
            options={[
              { value: "s", label: "S", ariaLabel: "Small" },
              { value: "m", label: "M", ariaLabel: "Medium" },
              { value: "l", label: "L", ariaLabel: "Large" },
              { value: "xl", label: "XL", ariaLabel: "Extra large" },
            ]}
          />
        </Row>
        <Row label="Width">
          <Segmented
            label="Column width"
            value={reader.measure}
            onChange={(measure) => setReader({ measure })}
            options={[
              { value: "narrow", label: "Narrow" },
              { value: "medium", label: "Medium" },
              { value: "wide", label: "Wide" },
            ]}
          />
        </Row>

        <div className="border-border -mx-3.5 my-0.5 border-t" />

        <Row label="Explanations">
          <Segmented<ExplainLevel>
            label="Explanation level"
            value={explainPrefs.level}
            onChange={(level) => setExplainPrefs({ level })}
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "balanced", label: "Balanced" },
              { value: "expert", label: "Expert" },
            ]}
          />
        </Row>
        <Row label="Code examples">
          <Segmented<CodeExamplePref>
            label="Code examples"
            value={explainPrefs.codeExamples}
            onChange={(codeExamples) => setExplainPrefs({ codeExamples })}
            options={[
              { value: "never", label: "Never" },
              { value: "helpful", label: "When helpful" },
              { value: "always", label: "Always" },
            ]}
          />
        </Row>

        <div className="border-border -mx-3.5 my-0.5 border-t" />

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[0.72rem]">
            Block remote images
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={blockImages}
            aria-label="Block remote images"
            onClick={() => setBlockImages(!blockImages)}
            className={
              "focus-visible:ring-ring/60 relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 " +
              (blockImages
                ? "bg-primary"
                : "bg-secondary shadow-[inset_0_0_0_1px_var(--border)]")
            }
          >
            <span
              className={
                "absolute top-0.5 size-3.5 rounded-full transition-transform " +
                (blockImages
                  ? "bg-primary-foreground translate-x-[18px]"
                  : "bg-card translate-x-0.5 shadow-[var(--shadow-card)]")
              }
            />
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 justify-between text-[0.75rem]"
          onClick={() => setFocusMode(true)}
        >
          <span className="flex items-center gap-2">
            <Focus className="size-3.5" />
            Focus mode
          </span>
          <kbd className="text-muted-foreground font-sans text-[0.6875rem]">
            {MOD}.
          </kbd>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-[0.72rem] whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  );
}

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore, type Theme } from "@/stores/ui-store";

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light theme" },
  { value: "dark", icon: Moon, label: "Dark theme" },
  { value: "system", icon: Monitor, label: "System theme" },
];

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div className="border-border bg-muted/40 flex items-center gap-0.5 rounded-md border p-0.5">
      {THEMES.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant={theme === value ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}

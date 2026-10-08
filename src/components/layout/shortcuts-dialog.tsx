import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";
import { useUiStore } from "@/stores/ui-store";

const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Every keyboard shortcut, opened with Cmd/Ctrl+/ or from the palette. */
export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[min(30rem,calc(100vw-2rem))] p-6">
        <DialogTitle className="text-[1.25rem] font-bold tracking-[-0.01em]">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">
          Every keyboard shortcut in Yomu.
        </DialogDescription>
        <div className="mt-2 flex flex-col gap-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-muted-foreground mb-1.5 text-[0.75rem] font-medium">
                {group.title}
              </h3>
              <ul>
                {group.items.map(([keys, what]) => (
                  <li
                    key={keys + what}
                    className="flex items-center justify-between gap-6 py-1.5 text-[0.8125rem]"
                  >
                    <span>{what}</span>
                    <kbd className="bg-muted text-muted-foreground shrink-0 rounded-md px-2 py-0.5 font-sans text-[0.75rem]">
                      {MOD}
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

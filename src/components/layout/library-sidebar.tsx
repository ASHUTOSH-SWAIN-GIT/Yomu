import { Library, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function LibrarySidebar() {
  return (
    <aside className="border-border bg-muted/20 flex h-full w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Library className="text-muted-foreground size-4" />
          Library
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Add article"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="border-border bg-background text-muted-foreground flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
          <Search className="size-3.5" />
          <span>Search articles</span>
        </div>
      </div>

      <Separator />

      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <p>No articles yet.</p>
        <p className="text-xs">Paste a link to get started.</p>
      </div>
    </aside>
  );
}

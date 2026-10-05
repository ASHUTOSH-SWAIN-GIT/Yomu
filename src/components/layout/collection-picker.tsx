import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildSpaces, INBOX } from "@/lib/spaces";
import { normalizeTag } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** "Save to a collection": a list of the collections with a tick on the ones
 * this blog is in. Clicking one adds or removes the blog. Every blog is
 * always in Home, the default collection; these are the extra ones. */
export function CollectionPicker({
  articleId,
  trigger,
  open,
  onOpenChange,
  align,
}: {
  articleId: string;
  /** The button that opens the list. */
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
}) {
  const articles = useLibraryStore((s) => s.articles);
  const addTag = useLibraryStore((s) => s.addTag);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const extra = useSpacesStore((s) => s.extra);
  const slots = useSpacesStore((s) => s.slots);
  const [name, setName] = useState("");

  const tags = articles.find((a) => a.id === articleId)?.tags ?? [];
  const collections = useMemo(
    () => buildSpaces(articles, extra, slots, "").filter((s) => s.id !== INBOX),
    [articles, extra, slots],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align ?? "end"} className="flex w-56 flex-col p-1">
        <p className="text-muted-foreground px-2.5 pt-1.5 pb-1 text-[0.75rem]">
          Save to a collection
        </p>
        {collections.length === 0 && (
          <p className="text-muted-foreground px-2.5 py-2 text-[0.8125rem]">
            No collections yet.
          </p>
        )}
        {collections.map((c) => {
          const on = tags.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() =>
                void (on ? removeTag(articleId, c.id) : addTag(articleId, c.id))
              }
              className="hover:bg-accent focus-visible:ring-ring/60 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[0.8125rem] outline-none focus-visible:ring-2"
            >
              <i
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    c.slot === null ? "var(--sp-inbox)" : `var(--sp-${c.slot})`,
                }}
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <Check
                className={cn("size-3.5 shrink-0", !on && "invisible")}
                aria-hidden
              />
            </button>
          );
        })}
        {/* A new collection is made by tagging this blog with its name. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = normalizeTag(name);
            if (!id || id === INBOX) return;
            void addTag(articleId, id);
            setName("");
          }}
          className="mt-0.5 flex h-8 items-center gap-2.5 px-2.5"
        >
          <Plus
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="New collection"
            aria-label="New collection name"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none"
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addArticleTag } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/stores/library-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** The page behind "New collection": name it and tick the saved blogs that
 * belong in it. A collection is a tag, so adding a blog tags it. */
export function NewCollection() {
  const articles = useLibraryStore((s) => s.articles).filter(
    (a) => !a.archived,
  );
  const refresh = useLibraryStore((s) => s.refresh);
  const createSpace = useSpacesStore((s) => s.createSpace);
  const setCreating = useSpacesStore((s) => s.setCreating);

  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const id = createSpace(name);
    if (!id) {
      setError("Pick a different name.");
      setBusy(false);
      return;
    }
    await Promise.all(
      [...picked].map((articleId) => addArticleTag(articleId, id)),
    );
    await refresh();
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mx-auto w-full max-w-[54rem] px-10 pt-12 pb-32"
    >
      <h1 className="mt-1 text-[2.125rem] leading-[1.15] font-medium tracking-[-0.02em]">
        New collection
      </h1>
      <p className="text-muted-foreground mt-2 text-[0.8125rem]">
        Name it, then pick the blogs that belong in it.
      </p>

      <label
        className="mt-8 block text-[0.8125rem] font-medium"
        htmlFor="collection-name"
      >
        Name
      </label>
      <input
        id="collection-name"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
        maxLength={32}
        placeholder="e.g. Databases"
        className="bg-card placeholder:text-muted-foreground focus:ring-ring/60 mt-2 h-11 w-full max-w-[32rem] rounded-none px-4 text-[0.9375rem] shadow-[var(--shadow-card)] outline-none focus:ring-2"
      />
      {error && (
        <p role="alert" className="text-destructive mt-2 text-[0.8125rem]">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-[0.8125rem] font-medium">Add blogs</h2>
        <span className="text-muted-foreground text-[0.75rem]">
          {picked.size} selected
        </span>
      </div>
      {articles.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-[0.8125rem]">
          No saved blogs yet. You can still create the collection and add blogs
          to it later.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col" role="listbox" aria-multiselectable>
          {articles.map((a) => {
            const on = picked.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "focus-visible:ring-ring/60 hover:bg-muted flex h-12 w-full items-center gap-3 px-3 text-left outline-none focus-visible:ring-2",
                    on && "bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "border-input grid size-4 shrink-0 place-items-center border",
                      on && "bg-primary text-primary-foreground border-primary",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.875rem] font-medium">
                      {a.title}
                    </span>
                    <span className="text-muted-foreground truncate text-[0.75rem]">
                      {a.site}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex gap-2">
        <Button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-none px-4"
        >
          Create collection
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setCreating(false)}
          className="rounded-none px-4"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  MoreHorizontal,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { exportArticle } from "@/lib/export-markdown";
import { logError } from "@/lib/log";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

/** Tags inline under the byline; less frequent actions (re-fetch, archive,
 * export) live in a "…" menu so the header stays quiet. Tags and archive
 * state come from the library store so the sidebar stays in step. */
export function ArticleTools({ article }: { article: StoredArticle }) {
  const summary = useLibraryStore((s) =>
    s.articles.find((a) => a.id === article.id),
  );
  const addTag = useLibraryStore((s) => s.addTag);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const setArchived = useLibraryStore((s) => s.setArchived);
  const rescrape = useReaderStore((s) => s.rescrape);
  const messages = useChatStore((s) => s.messages);
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const tags = summary?.tags ?? [];
  const archived = summary?.archived ?? article.archived;

  function submitTag(e: FormEvent) {
    e.preventDefault();
    if (!tagInput.trim()) return;
    void addTag(article.id, tagInput);
    setTagInput("");
  }

  async function handleExport() {
    setOpen(false);
    try {
      const saved = await exportArticle(article, tags, messages);
      setStatus(saved ? "Exported as Markdown" : null);
    } catch (err) {
      logError("export failed", err);
      setStatus("Export failed. Check the log for details.");
    }
    setTimeout(() => setStatus(null), 3000);
  }

  return (
    <div className="flex items-center gap-1.5 font-sans text-[0.75rem]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="border-border text-foreground flex h-6 items-center gap-1 rounded-md border pr-1 pl-2"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove from ${tag}`}
            onClick={() => void removeTag(article.id, tag)}
            className="hover:text-foreground focus-visible:ring-ring/60 rounded-full outline-none focus-visible:ring-2"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <form onSubmit={submitTag}>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="+ Add to a space"
          aria-label="Add to a space"
          maxLength={32}
          className="placeholder:text-muted-foreground hover:placeholder:text-foreground focus:border-input h-6 w-[7.5rem] rounded-md border border-transparent bg-transparent px-1.5 text-right outline-none focus:text-left"
        />
      </form>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6"
            aria-label="Article actions"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-52 flex-col gap-0.5 p-1">
          <MenuItem
            icon={<RefreshCw className="size-3.5" />}
            label="Re-fetch article"
            onClick={() => {
              setOpen(false);
              void rescrape(article);
            }}
          />
          <MenuItem
            icon={
              archived ? (
                <ArchiveRestore className="size-3.5" />
              ) : (
                <Archive className="size-3.5" />
              )
            }
            label={archived ? "Move out of archive" : "Archive"}
            onClick={() => {
              setOpen(false);
              void setArchived(article.id, !archived);
            }}
          />
          <MenuItem
            icon={<Download className="size-3.5" />}
            label="Export as Markdown"
            onClick={() => void handleExport()}
          />
        </PopoverContent>
      </Popover>

      {status && (
        <span role="status" className="text-muted-foreground text-xs">
          {status}
        </span>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent focus-visible:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.75rem] outline-none"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

import { useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportArticle } from "@/lib/export-markdown";
import { logError } from "@/lib/log";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import type { StoredArticle } from "@/types/library";

/** Tags, archive, export and re-fetch for the open article. Tags and
 * archive state come from the library store so the sidebar stays in step. */
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

  const tags = summary?.tags ?? [];
  const archived = summary?.archived ?? article.archived;

  function submitTag(e: FormEvent) {
    e.preventDefault();
    if (!tagInput.trim()) return;
    void addTag(article.id, tagInput);
    setTagInput("");
  }

  async function handleExport() {
    try {
      const saved = await exportArticle(article, tags, messages);
      setStatus(saved ? "Exported" : null);
    } catch (err) {
      logError("export failed", err);
      setStatus("Export failed");
    }
    setTimeout(() => setStatus(null), 2500);
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="border-input text-muted-foreground flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-xs"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => void removeTag(article.id, tag)}
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-2"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form onSubmit={submitTag} className="flex items-center gap-1">
          <Plus className="text-muted-foreground size-3" aria-hidden />
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag"
            aria-label="Add tag"
            maxLength={32}
            className="placeholder:text-muted-foreground focus-visible:ring-ring/50 w-20 rounded bg-transparent text-xs outline-none focus-visible:ring-2"
          />
        </form>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-1">
        <ToolButton
          icon={<RefreshCw className="size-3" />}
          label="Re-fetch"
          onClick={() => void rescrape(article)}
        />
        <ToolButton
          icon={
            archived ? (
              <ArchiveRestore className="size-3" />
            ) : (
              <Archive className="size-3" />
            )
          }
          label={archived ? "Unarchive" : "Archive"}
          onClick={() => void setArchived(article.id, !archived)}
        />
        <ToolButton
          icon={<Download className="size-3" />}
          label="Export Markdown"
          onClick={() => void handleExport()}
        />
        {status && (
          <span role="status" className="text-xs">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

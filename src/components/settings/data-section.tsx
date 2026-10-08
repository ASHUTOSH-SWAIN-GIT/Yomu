import { useCallback, useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Section, Setting } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import { storageInfo } from "@/lib/commands";
import { clearAllChats, clearImageCache, deleteEverything } from "@/lib/data";
import { formatBytes } from "@/lib/format";
import { logError } from "@/lib/log";
import { useLibraryStore } from "@/stores/library-store";
import type { StorageInfo } from "@/types/agent";

type Danger = "chats" | "everything" | null;

/** Where the data lives and how much room it takes, and ways to clear it. */
export function DataSection() {
  const blogs = useLibraryStore((s) => s.articles.length);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Danger>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    storageInfo()
      .then(setInfo)
      .catch((err) => logError("reading the storage info failed", err));
  }, []);
  useEffect(load, [load]);

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(true);
    setConfirming(null);
    try {
      await work();
      setMessage(label);
    } catch (err) {
      logError(`${label} failed`, err);
      setMessage("That did not work. Check the log for details.");
    }
    setBusy(false);
    load();
  }

  return (
    <Section id="data" title="Data">
      <Setting label="Where it is kept" hint={info?.dataDir ?? "Looking…"}>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-lg"
          disabled={!info}
          onClick={() => info && void revealItemInDir(info.dataDir)}
        >
          Show in Finder
        </Button>
      </Setting>

      <div className="bg-muted grid grid-cols-3 gap-px overflow-hidden rounded-2xl text-[0.8125rem]">
        <Stat label="Blogs" value={String(blogs)} />
        <Stat
          label="Database"
          value={info ? formatBytes(info.databaseBytes) : "…"}
        />
        <Stat
          label="Saved images"
          value={
            info
              ? `${formatBytes(info.imagesBytes)} · ${info.imagesCount}`
              : "…"
          }
        />
      </div>

      <Setting label="Clear saved images">
        <Button
          size="sm"
          variant="secondary"
          className="rounded-lg"
          disabled={busy || !info?.imagesCount}
          onClick={() => void run("Saved images cleared.", clearImageCache)}
        >
          Clear images
        </Button>
      </Setting>

      <Setting label="Delete all chats">
        {confirming === "chats" ? (
          <Confirm
            question="Delete all chats?"
            onYes={() => void run("All chats deleted.", clearAllChats)}
            onNo={() => setConfirming(null)}
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="rounded-lg"
            disabled={busy}
            onClick={() => setConfirming("chats")}
          >
            Delete chats
          </Button>
        )}
      </Setting>

      <Setting label="Delete everything" hint="This cannot be undone.">
        {confirming === "everything" ? (
          <Confirm
            question="Delete everything?"
            onYes={() => void run("Everything deleted.", deleteEverything)}
            onNo={() => setConfirming(null)}
          />
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="rounded-lg"
            disabled={busy}
            onClick={() => setConfirming("everything")}
          >
            Delete everything
          </Button>
        )}
      </Setting>

      {message && (
        <p role="status" className="text-muted-foreground text-[0.8125rem]">
          {message}
        </p>
      )}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card flex flex-col gap-0.5 px-4 py-3">
      <span className="text-muted-foreground text-[0.6875rem]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Confirm({
  question,
  onYes,
  onNo,
}: {
  question: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <span className="flex items-center gap-2 text-[0.8125rem]">
      <span>{question}</span>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 rounded-lg px-2.5 text-[0.75rem]"
        onClick={onYes}
      >
        Delete
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 rounded-lg px-2.5 text-[0.75rem]"
        onClick={onNo}
      >
        Cancel
      </Button>
    </span>
  );
}

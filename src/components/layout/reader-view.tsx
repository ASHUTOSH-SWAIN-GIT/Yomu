import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReaderView() {
  return (
    <main className="flex h-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <LinkIcon className="text-muted-foreground size-5" />
        </div>
        <h1 className="text-foreground text-lg font-medium">
          Paste a link to start reading
        </h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Docs, engineering blogs, and free articles render here as a clean,
          distraction free reader.
        </p>
        <div className="mt-2 flex w-full max-w-sm items-center gap-2">
          <input
            type="url"
            placeholder="https://..."
            className="border-border bg-background focus-visible:ring-ring/50 h-9 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
          />
          <Button size="sm">Open</Button>
        </div>
      </div>
    </main>
  );
}

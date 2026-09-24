import { useState } from "react";
import { ImageOff } from "lucide-react";
import { isRemoteImage } from "@/lib/images";
import { useUiStore } from "@/stores/ui-store";

export function ImageBlock({ src, alt }: { src: string; alt: string | null }) {
  const blockRemote = useUiStore((s) => s.blockRemoteImages);
  const [allowed, setAllowed] = useState(false);

  if (blockRemote && !allowed && isRemoteImage(src)) {
    return (
      <figure className="my-4">
        <button
          type="button"
          onClick={() => setAllowed(true)}
          className="border-input text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 mx-auto flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm outline-none focus-visible:ring-2"
        >
          <ImageOff className="size-4" aria-hidden />
          <span>Image blocked{alt ? `: ${alt}` : ""}. Click to load it.</span>
        </button>
      </figure>
    );
  }

  return (
    <figure className="my-4">
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        // Don't tell the image host which article you're reading.
        referrerPolicy="no-referrer"
        className="border-border mx-auto max-w-full rounded-lg border"
      />
      {alt && (
        <figcaption className="text-muted-foreground mt-2 text-center text-xs">
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

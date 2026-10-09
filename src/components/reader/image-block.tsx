import { useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageOff, MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/reader/image-lightbox";
import { isRemoteImage, isSvgUrl, resolveImageUrl } from "@/lib/images";
import { useChatStore } from "@/stores/chat-store";
import { useCommentsStore } from "@/stores/comments-store";
import { useImageStore } from "@/stores/image-store";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";

export function ImageBlock({
  src: rawSrc,
  alt,
  baseUrl,
  blockIndex,
}: {
  src: string;
  alt: string | null;
  /** The article's URL, for images saved with a relative `src`. */
  baseUrl: string;
  /** Position in the article, used to anchor a question about this image. */
  blockIndex: number;
}) {
  const remote = resolveImageUrl(rawSrc, baseUrl);
  const blockRemote = useUiStore((s) => s.blockRemoteImages);
  const dir = useImageStore((s) => s.dir);
  const cached = useImageStore((s) => s.files[remote]);
  const loaded = useImageStore((s) => s.loaded);
  const article = useReaderStore((s) =>
    s.state.status === "ready" ? s.state.article : null,
  );
  const streaming = useChatStore((s) => s.streaming);
  const explainImage = useChatStore((s) => s.explainImage);
  const startDraft = useCommentsStore((s) => s.startDraft);
  const [allowed, setAllowed] = useState(false);
  // If the cached copy won't load, fall back to the remote URL; if that
  // fails too, show a placeholder.
  const [localBroken, setLocalBroken] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // Set while the picture is zoomed; the in-page copy hides meanwhile so it
  // looks like the same picture lifting off the page.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  // A cached copy is local: no network, so the block setting can't apply.
  const src =
    dir && cached && !localBroken ? convertFileSrc(`${dir}/${cached}`) : remote;
  const isLocal = src !== remote;

  // Wait for the cache index so a cached image never touches the network.
  if (!loaded) {
    return (
      <figure className="my-[1em]" aria-busy="true">
        <div className="bg-muted h-40 animate-pulse rounded-lg" />
      </figure>
    );
  }

  if (!isLocal && blockRemote && !allowed && isRemoteImage(src)) {
    return (
      <figure className="my-[1em]">
        <button
          type="button"
          onClick={() => setAllowed(true)}
          className="border-border text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 mx-auto flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm outline-none focus-visible:ring-2"
        >
          <ImageOff className="size-4" aria-hidden />
          <span>Image blocked{alt ? `: ${alt}` : ""}. Click to load it.</span>
        </button>
      </figure>
    );
  }

  if (failed) {
    return (
      <figure className="my-[1em]">
        <div className="border-border text-muted-foreground flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm">
          <ImageOff className="size-4" aria-hidden />
          <span>Image unavailable{alt ? `: ${alt}` : ""}</span>
        </div>
      </figure>
    );
  }

  return (
    <figure className="group relative my-[1em]">
      <button
        type="button"
        aria-label={alt ? `Zoom in: ${alt}` : "Zoom in on this image"}
        onClick={() => {
          const img = imgRef.current;
          if (!img) return;
          setNatural({
            w: img.naturalWidth || img.clientWidth,
            h: img.naturalHeight || img.clientHeight,
          });
        }}
        className="focus-visible:ring-ring/60 mx-auto block max-w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2"
      >
        <img
          ref={imgRef}
          src={src}
          onError={() => (isLocal ? setLocalBroken(true) : setFailed(true))}
          alt={alt ?? ""}
          loading="lazy"
          // Don't tell the image host which article you're reading.
          referrerPolicy="no-referrer"
          className="mx-auto max-w-full rounded-lg shadow-[var(--shadow-card)]"
          style={{ visibility: natural ? "hidden" : "visible" }}
        />
      </button>
      {natural && (
        <ImageLightbox
          src={src}
          alt={alt}
          natural={natural}
          getOrigin={() =>
            imgRef.current?.getBoundingClientRect() ?? new DOMRect()
          }
          onClosed={() => setNatural(null)}
        />
      )}
      {article && (
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="shadow-md"
            // A note on the whole picture; it sits beside it like any comment.
            onClick={() =>
              startDraft({ blockIndex, start: 0, end: 0, quote: "" })
            }
          >
            <MessageSquareText className="size-3.5" />
            Comment
          </Button>
          {!isSvgUrl(remote) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={streaming}
              className="shadow-md"
              // Sends this image to the agent, which counts against plan quota.
              title="Send this image to your agent"
              onClick={() =>
                void explainImage(article, { blockIndex, src: remote, alt })
              }
            >
              <Sparkles className="size-3.5" />
              Ask about image
            </Button>
          )}
        </div>
      )}
      {alt && (
        <figcaption className="text-muted-foreground mt-2 text-center font-sans text-[0.8125rem]">
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

export function ImageBlock({ src, alt }: { src: string; alt: string | null }) {
  return (
    <figure className="my-4">
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
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

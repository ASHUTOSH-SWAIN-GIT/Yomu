import type { Span } from "@/types/article";
import { cn } from "@/lib/utils";

/**
 * Renders spans as React elements, never `dangerouslySetInnerHTML`.
 * Article content is untrusted; building an element tree from structured
 * spans (see src-tauri/src/scraper/blocks.rs) keeps it that way safely.
 */
export function ParagraphBlock({ spans }: { spans: Span[] }) {
  return (
    <p className="text-foreground my-[0.55em] text-pretty">
      {spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
    </p>
  );
}

export function SpanText({ span }: { span: Span }) {
  const className = cn(
    span.bold && "font-semibold",
    span.italic && "italic",
    span.code &&
      "rounded bg-muted px-[0.3em] py-[0.08em] font-mono text-[0.85em] text-foreground",
  );

  const content = span.text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));

  if (span.href) {
    return (
      <a
        href={span.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          // Links carry the accent so they are findable in a wall of prose.
          "text-primary decoration-primary/35 hover:decoration-primary underline underline-offset-[0.2em]",
          className,
        )}
      >
        {content}
      </a>
    );
  }

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return <>{content}</>;
}

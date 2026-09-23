import type { Span } from "@/types/article";
import { cn } from "@/lib/utils";

/**
 * Renders spans as React elements, never `dangerouslySetInnerHTML`.
 * Article content is untrusted; building an element tree from structured
 * spans (see src-tauri/src/scraper/blocks.rs) keeps it that way safely.
 */
export function ParagraphBlock({ spans }: { spans: Span[] }) {
  return (
    <p className="text-foreground my-3 text-[15px] leading-7">
      {spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
    </p>
  );
}

function SpanText({ span }: { span: Span }) {
  const className = cn(
    span.bold && "font-semibold",
    span.italic && "italic",
    span.code &&
      "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground",
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
          "text-foreground underline underline-offset-2",
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

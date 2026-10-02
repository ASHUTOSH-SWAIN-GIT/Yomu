import type { Span } from "@/types/article";
import { cn } from "@/lib/utils";

/**
 * Renders spans as React elements, never `dangerouslySetInnerHTML`.
 * Article content is untrusted; building an element tree from structured
 * spans (see src-tauri/src/scraper/blocks.rs) keeps it that way safely.
 */
export function ParagraphBlock({ spans }: { spans: Span[] }) {
  return (
    <p className="my-[0.55em] text-pretty text-[var(--reader-ink)]">
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
      "rounded-[0.3em] bg-muted px-[0.32em] py-[0.08em] font-mono text-[0.84em] text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
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
          // Links keep the ink colour with a honey underline, so they are
          // findable in a wall of prose without shouting.
          "text-foreground decoration-honey/60 hover:decoration-honey underline decoration-[0.09em] underline-offset-[0.2em] transition-colors",
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

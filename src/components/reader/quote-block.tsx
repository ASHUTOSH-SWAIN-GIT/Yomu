import type { Span } from "@/types/article";
import { SpanText } from "@/components/reader/paragraph-block";

export function QuoteBlock({ spans }: { spans: Span[] }) {
  return (
    <blockquote className="border-primary/40 text-muted-foreground my-[0.9em] border-l-[3px] pl-[1.1em] italic">
      {spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
    </blockquote>
  );
}

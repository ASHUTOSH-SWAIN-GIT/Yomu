import type { Span } from "@/types/article";
import { SpanText } from "@/components/reader/paragraph-block";

export function QuoteBlock({ spans }: { spans: Span[] }) {
  return (
    <blockquote className="border-border text-muted-foreground my-4 border-l-2 pl-4 text-[15px] leading-7">
      {spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
    </blockquote>
  );
}

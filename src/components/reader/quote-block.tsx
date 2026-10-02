import type { Span } from "@/types/article";
import { SpanText } from "@/components/reader/paragraph-block";

export function QuoteBlock({ spans }: { spans: Span[] }) {
  return (
    <blockquote className="border-honey my-[1.1em] border-l-[3px] py-[0.1em] pl-[1.1em] text-[var(--reader-ink)] italic opacity-90">
      {spans.map((span, i) => (
        <SpanText key={i} span={span} />
      ))}
    </blockquote>
  );
}

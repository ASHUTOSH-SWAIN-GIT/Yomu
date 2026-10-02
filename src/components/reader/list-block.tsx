import type { ListItem } from "@/types/article";
import { SpanText } from "@/components/reader/paragraph-block";

/** Ordered lists number each level separately; nesting is shown by
 * indent (the Rust side flattens nested lists into `depth`). Markers are
 * CSS pseudo-content, not text nodes, so selecting an item to Explain
 * doesn't drag "•" or "1." into the passage. */
export function ListBlock({
  ordered,
  items,
}: {
  ordered: boolean;
  items: ListItem[];
}) {
  const counters: number[] = [];
  return (
    <ul className="my-[0.7em] space-y-[0.4em]" role="list">
      {items.map((item, i) => {
        counters.length = item.depth + 1;
        counters[item.depth] = (counters[item.depth] ?? 0) + 1;
        const marker = ordered ? `${counters[item.depth]}.` : "•";
        return (
          <li
            key={i}
            data-marker={marker}
            className="before:text-muted-foreground flex gap-2 text-[var(--reader-ink)] before:w-5 before:shrink-0 before:text-right before:font-sans before:tabular-nums before:content-[attr(data-marker)]"
            style={{ paddingLeft: `${item.depth * 1.25}rem` }}
          >
            <span className="min-w-0">
              {item.spans.map((span, j) => (
                <SpanText key={j} span={span} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

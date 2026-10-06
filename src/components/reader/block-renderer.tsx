import type { ReactNode } from "react";
import type { Block } from "@/types/article";
import { HeadingBlock } from "@/components/reader/heading-block";
import { ParagraphBlock } from "@/components/reader/paragraph-block";
import { CodeBlock } from "@/components/reader/code-block";
import { ImageBlock } from "@/components/reader/image-block";
import { MathBlock } from "@/components/reader/math-block";
import { ListBlock } from "@/components/reader/list-block";
import { QuoteBlock } from "@/components/reader/quote-block";
import { TableBlock } from "@/components/reader/table-block";

export function BlockRenderer({
  blocks,
  baseUrl,
  aside,
}: {
  blocks: Block[];
  baseUrl: string;
  /** Something that goes with a block (its comments). It sits outside the
   * block's own box, which clips what is drawn outside it, and which is
   * where the text positions of a selection are counted. */
  aside?: (index: number) => ReactNode;
}) {
  return (
    <>
      {blocks.map((block, i) => (
        // The index is what highlights are anchored to (see
        // hooks/use-text-selection.ts).
        // Margins inside a block do NOT collapse with its neighbours (content-visibility
        // isolates it), so each block owns half of the gap it wants.
        // content-visibility skips layout/paint of off-screen blocks, which
        // keeps very long docs pages smooth.
        <div key={i} className="relative">
          <div
            data-block-index={i}
            className="[contain-intrinsic-size:auto_80px] [content-visibility:auto]"
          >
            <BlockView block={block} baseUrl={baseUrl} index={i} />
          </div>
          {aside?.(i)}
        </div>
      ))}
    </>
  );
}

function BlockView({
  block,
  baseUrl,
  index,
}: {
  block: Block;
  baseUrl: string;
  index: number;
}) {
  switch (block.type) {
    case "heading":
      return <HeadingBlock level={block.level} text={block.text} />;
    case "paragraph":
      return <ParagraphBlock spans={block.spans} />;
    case "code":
      return <CodeBlock language={block.language} content={block.content} />;
    case "image":
      return (
        <ImageBlock
          src={block.src}
          alt={block.alt}
          baseUrl={baseUrl}
          blockIndex={index}
        />
      );
    case "math":
      return <MathBlock tex={block.tex} />;
    case "list":
      return <ListBlock ordered={block.ordered} items={block.items} />;
    case "quote":
      return <QuoteBlock spans={block.spans} />;
    case "table":
      return <TableBlock header={block.header} rows={block.rows} />;
  }
}

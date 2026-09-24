import type { Block } from "@/types/article";
import { HeadingBlock } from "@/components/reader/heading-block";
import { ParagraphBlock } from "@/components/reader/paragraph-block";
import { CodeBlock } from "@/components/reader/code-block";
import { ImageBlock } from "@/components/reader/image-block";
import { MathBlock } from "@/components/reader/math-block";

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        // The index is what highlights are anchored to (see
        // hooks/use-text-selection.ts).
        // content-visibility skips layout/paint of off-screen blocks, which
        // keeps very long docs pages smooth.
        <div
          key={i}
          data-block-index={i}
          className="[contain-intrinsic-size:auto_80px] [content-visibility:auto]"
        >
          <BlockView block={block} />
        </div>
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return <HeadingBlock level={block.level} text={block.text} />;
    case "paragraph":
      return <ParagraphBlock spans={block.spans} />;
    case "code":
      return <CodeBlock language={block.language} content={block.content} />;
    case "image":
      return <ImageBlock src={block.src} alt={block.alt} />;
    case "math":
      return <MathBlock tex={block.tex} />;
  }
}

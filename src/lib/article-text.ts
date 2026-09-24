import type { Block } from "@/types/article";

/** Plain-ish text of one block. Used for the agent's context, for the
 * search index, and (with structure kept) for Markdown export. */
export function blockText(block: Block): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph":
      return block.spans.map((s) => s.text).join("");
    case "code":
      return "```" + (block.language ?? "") + "\n" + block.content + "\n```";
    case "math":
      return `$$${block.tex}$$`;
    case "image":
      return block.alt ? `[image: ${block.alt}]` : "";
    case "list":
      return block.items
        .map(
          (item, i) =>
            `${"  ".repeat(item.depth)}${block.ordered ? `${i + 1}.` : "-"} ${item.spans.map((s) => s.text).join("")}`,
        )
        .join("\n");
    case "quote":
      return block.spans
        .map((s) => s.text)
        .join("")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "table":
      return [block.header, ...block.rows]
        .filter((row) => row.length > 0)
        .map((row) => `| ${row.join(" | ")} |`)
        .join("\n");
  }
}

/** All of an article's text, blocks separated by blank lines. */
export function articleText(blocks: Block[]): string {
  return blocks.map(blockText).filter(Boolean).join("\n\n");
}

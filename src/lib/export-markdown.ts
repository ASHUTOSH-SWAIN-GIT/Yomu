import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Block, Span } from "@/types/article";
import type { ChatMessage } from "@/stores/chat-store";
import type { StoredArticle } from "@/types/library";

function spanMd(span: Span): string {
  let text = span.text.replace(/\n/g, " ");
  if (!text.trim()) return text;
  if (span.code) text = `\`${text}\``;
  if (span.bold) text = `**${text}**`;
  if (span.italic) text = `*${text}*`;
  return span.href ? `[${text}](${span.href})` : text;
}

const inline = (spans: Span[]) => spans.map(spanMd).join("");

function blockMd(block: Block): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph":
      return inline(block.spans);
    case "code":
      return "```" + (block.language ?? "") + "\n" + block.content + "\n```";
    case "image":
      return `![${block.alt ?? ""}](${block.src})`;
    case "math":
      return `$$\n${block.tex}\n$$`;
    case "list":
      return block.items
        .map(
          (item, i) =>
            `${"  ".repeat(item.depth)}${block.ordered ? `${i + 1}.` : "-"} ${inline(item.spans)}`,
        )
        .join("\n");
    case "quote":
      return block.spans
        .map(spanMd)
        .join("")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "table": {
      const cell = (c: string) => c.replace(/\|/g, "\\|");
      const width = Math.max(
        block.header.length,
        ...block.rows.map((r) => r.length),
      );
      const pad = (row: string[]) =>
        Array.from({ length: width }, (_, i) => cell(row[i] ?? ""));
      const header = block.header.length ? pad(block.header) : pad([]);
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...block.rows.map((r) => `| ${pad(r).join(" | ")} |`),
      ];
      return lines.join("\n");
    }
  }
}

/** The article as Markdown, followed by the user's explanations: each
 * explained passage as a quote with the agent's answer and follow ups. */
export function toMarkdown(
  article: StoredArticle,
  tags: string[],
  messages: ChatMessage[],
): string {
  const lines: string[] = [`# ${article.title}`, ""];
  const meta = [
    article.author,
    article.site,
    `[Source](${article.url})`,
    tags.length ? `Tags: ${tags.join(", ")}` : "",
  ].filter(Boolean);
  lines.push(meta.join(" · "), "");
  lines.push(article.blocks.map(blockMd).filter(Boolean).join("\n\n"), "");

  if (messages.length > 0) {
    lines.push("---", "", "## Explanations", "");
    for (const m of messages) {
      if (m.role === "user" && m.quote) {
        lines.push(
          m.quote
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
          "",
        );
      } else if (m.role === "user") {
        lines.push(`**${m.text}**`, "");
      } else {
        lines.push(m.text, "");
      }
    }
  }
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

function fileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "article"}.md`;
}

/** Asks where to save, then writes the Markdown. Returns false if the
 * user cancelled the dialog. */
export async function exportArticle(
  article: StoredArticle,
  tags: string[],
  messages: ChatMessage[],
): Promise<boolean> {
  const path = await save({
    defaultPath: fileName(article.title),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return false;
  await writeTextFile(path, toMarkdown(article, tags, messages));
  return true;
}

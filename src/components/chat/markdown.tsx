import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { SourceLink } from "@/components/chat/source-link";
import { CodeBlock } from "@/components/reader/code-block";
import { parseSourceHref } from "@/lib/source-links";

/**
 * Renders agent replies. Reuses the reader's Shiki `CodeBlock` and KaTeX
 * (via rehype-katex) so chat and article look the same. react-markdown
 * builds React elements (no raw HTML), which matters because model output
 * can echo untrusted article text.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        // Links to saved blogs (yomu:<id>#<paragraph>) are ours; anything
        // else keeps the usual safe-link rules.
        urlTransform={(url) =>
          parseSourceHref(url) ? url : defaultUrlTransform(url)
        }
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const text = String(children);
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            if (!language && !text.includes("\n")) {
              return (
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock
                language={language ?? null}
                content={text.replace(/\n$/, "")}
              />
            );
          },
          a: ({ href, children }) => {
            const source = parseSourceHref(href);
            if (source)
              return <SourceLink source={source}>{children}</SourceLink>;
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

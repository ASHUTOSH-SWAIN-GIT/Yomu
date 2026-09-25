import { useEffect, useState } from "react";
import { highlightCode } from "@/lib/highlighter";

export function CodeBlock({
  language,
  content,
}: {
  language: string | null;
  content: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlightCode(content, language).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [content, language]);

  if (!html) {
    // Unstyled fallback while Shiki loads, so layout doesn't jump.
    return (
      <pre className="border-border bg-muted my-[0.9em] overflow-x-auto rounded-md border p-4 font-mono text-[0.8125rem] leading-6">
        <code>{content}</code>
      </pre>
    );
  }

  return (
    <div
      className="border-border my-[0.9em] overflow-x-auto rounded-md border font-mono text-[0.8125rem] leading-6 [&_pre]:m-0 [&_pre]:p-4"
      // Safe: `html` comes from our own Shiki render, not from the
      // scraped page. Article text inside is escaped by Shiki itself.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

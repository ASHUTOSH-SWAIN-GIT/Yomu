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
      <pre className="border-border bg-muted/40 my-4 overflow-x-auto rounded-lg border p-4 text-[13px] leading-6">
        <code>{content}</code>
      </pre>
    );
  }

  return (
    <div
      className="border-border my-4 overflow-x-auto rounded-lg border text-[13px] leading-6 [&_pre]:m-0 [&_pre]:p-4"
      // Safe: `html` comes from our own Shiki render, not from the
      // scraped page. Article text inside is escaped by Shiki itself.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { resolveTheme } from "@/lib/appearance";
import { highlightCode } from "@/lib/highlighter";
import { useUiStore } from "@/stores/ui-store";

export function CodeBlock({
  language,
  content,
}: {
  language: string | null;
  content: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  // A named theme brings its own code colours, so render again for it.
  const theme = useUiStore((s) => s.theme);
  const themeId = theme === "system" ? null : resolveTheme(theme, false).id;

  useEffect(() => {
    let cancelled = false;
    highlightCode(content, language, themeId).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [content, language, themeId]);

  return (
    <div className="bg-muted my-[1.1em] overflow-hidden rounded-lg font-sans shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="border-border text-muted-foreground flex h-8 items-center border-b pr-1.5 pl-3.5 text-[0.6875rem] font-medium">
        {language ?? "code"}
        <CopyButton text={content} />
      </div>
      {html ? (
        <div
          className="overflow-x-auto font-mono text-[0.8125rem] leading-6 [&_pre]:m-0 [&_pre]:px-4 [&_pre]:py-3.5"
          // Safe: `html` comes from our own Shiki render, not from the
          // scraped page. Article text inside is escaped by Shiki itself.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        // Unstyled fallback while Shiki loads, so layout doesn't jump.
        <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[0.8125rem] leading-6">
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 ml-auto flex h-6 items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-2 [&>svg]:size-3"
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

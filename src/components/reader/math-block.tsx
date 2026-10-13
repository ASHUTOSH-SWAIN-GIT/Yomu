import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { inlineMathHtml } from "@/lib/math";

export function MathBlock({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return null;
    }
  }, [tex]);

  if (!html) {
    return (
      <pre className="text-muted-foreground my-[0.9em] text-sm">{tex}</pre>
    );
  }

  return (
    <div
      className="my-[0.9em] overflow-x-auto"
      // Safe: `html` is KaTeX's own render of the tex string, not raw
      // article markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** A formula inside a sentence. */
export function InlineMath({ tex }: { tex: string }) {
  const html = useMemo(() => inlineMathHtml(tex), [tex]);

  if (!html) {
    return <span className="text-muted-foreground font-mono">{tex}</span>;
  }

  return (
    <span
      role="img"
      aria-label={tex}
      // Safe: `html` is KaTeX's own render of the tex string, not raw
      // article markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

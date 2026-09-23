import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

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
    return <pre className="text-muted-foreground my-4 text-sm">{tex}</pre>;
  }

  return (
    <div
      className="my-4 overflow-x-auto"
      // Safe: `html` is KaTeX's own render of the tex string, not raw
      // article markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** A link from an answer to a saved blog, optionally to one paragraph:
 * `yomu:<blog id>#<paragraph number>`. The agent writes these (its library
 * tools give it the ids and paragraph numbers); the chat turns them into
 * buttons that open the blog there. */
export interface SourceLink {
  id: string;
  /** The paragraph (block) number, when the answer names one. */
  block: number | null;
}

export function parseSourceHref(href: string | undefined): SourceLink | null {
  const match = /^yomu:([\w-]+)(?:#(\d+))?$/.exec(href ?? "");
  if (!match) return null;
  return { id: match[1], block: match[2] === undefined ? null : +match[2] };
}

export function sourceHref(id: string, block?: number | null): string {
  return `yomu:${id}${block == null ? "" : `#${block}`}`;
}

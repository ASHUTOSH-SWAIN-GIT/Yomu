/**
 * What a chat message is about. Stored in `messages.scope` (migration 5).
 *
 * - `passage`: the first question about a selected passage (anchors a margin note)
 * - `followup`: a reply inside an existing note
 * - `article`: a question about the whole article (shown in the thread sheet)
 * - `library`: a question across the saved library (thread sheet, with sources)
 */
export type MessageScope = "passage" | "followup" | "article" | "library";

const SCOPES: MessageScope[] = ["passage", "followup", "article", "library"];

/** The text stored for the "Summarize this article" request. Kept as the
 * stored label so rows written before scopes existed still read as article
 * questions. */
export const SUMMARY_LABEL = "Summarize this article";

export function parseScope(raw: unknown): MessageScope | null {
  return SCOPES.includes(raw as MessageScope) ? (raw as MessageScope) : null;
}

/** The scope of a stored user message. Rows from before migration 5 have no
 * scope, so infer it the way the app used to: a message with a highlight
 * started a passage note, the summary label was an article question, and
 * anything else was a follow-up. */
export function resolveScope(message: {
  scope: unknown;
  content: string;
  hasHighlight: boolean;
}): MessageScope {
  return (
    parseScope(message.scope) ??
    (message.hasHighlight
      ? "passage"
      : message.content === SUMMARY_LABEL
        ? "article"
        : "followup")
  );
}

/** Article and library questions live in the thread sheet; passage and
 * follow-up messages live in margin notes. */
export function isThreadScope(scope: MessageScope | undefined): boolean {
  return scope === "article" || scope === "library";
}

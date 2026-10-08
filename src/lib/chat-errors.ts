export type ChatErrorKind =
  | "usage_limit"
  | "logged_out"
  | "model_unavailable"
  | "adapter_crashed"
  | "adapter_missing"
  | "timeout"
  | "other";

export interface ChatError {
  kind: ChatErrorKind;
  message: string;
}

const KINDS: ChatErrorKind[] = [
  "usage_limit",
  "logged_out",
  "model_unavailable",
  "adapter_crashed",
  "adapter_missing",
  "timeout",
  "other",
];

/** An error as the Rust side sends it (`AgentError` in
 * src-tauri/src/agent/errors.rs): already sorted, and worded for the agent
 * the user runs. */
function fromAgent(value: unknown): ChatError | null {
  if (!value || typeof value !== "object") return null;
  const { kind, message } = value as { kind?: unknown; message?: unknown };
  if (typeof message !== "string") return null;
  return KINDS.includes(kind as ChatErrorKind)
    ? { kind: kind as ChatErrorKind, message }
    : null;
}

/** What went wrong, for the chat. Errors from the agent arrive sorted by the
 * Rust side. Anything else (a failure in the app itself, or an older
 * message) is sorted here by its wording, as a fallback. */
export function classifyError(err: unknown): ChatError {
  const typed = fromAgent(err);
  if (typed) return typed;
  const raw = err instanceof Error ? err.message : String(err);
  if (/usage limit|rate limit|quota|too many requests/i.test(raw)) {
    return {
      kind: "usage_limit",
      message: "You've hit the agent's usage limit. Try again once it resets.",
    };
  }
  if (/stopped responding/i.test(raw)) {
    return {
      kind: "timeout",
      message:
        "The agent stopped responding, so Yomu gave up on this answer. Retry starts a fresh session.",
    };
  }
  if (/unauthori[sz]ed|not logged in|log ?in|sign in|authenticat/i.test(raw)) {
    return {
      kind: "logged_out",
      message: "The agent isn't signed in. Sign in to continue.",
    };
  }
  if (/exited|closed before responding|broken pipe/i.test(raw)) {
    return {
      kind: "adapter_crashed",
      message: "The agent stopped unexpectedly. Retry restarts it.",
    };
  }
  if (/could not start|not available|no such file|not found/i.test(raw)) {
    return {
      kind: "adapter_missing",
      message:
        "Couldn't start the agent. Check that it is installed (the Codex adapter also needs Node.js).",
    };
  }
  return { kind: "other", message: raw };
}

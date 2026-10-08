export type ChatErrorKind =
  | "usage_limit"
  | "logged_out"
  | "adapter_crashed"
  | "adapter_missing"
  | "timeout"
  | "other";

export interface ChatError {
  kind: ChatErrorKind;
  message: string;
}

/** Maps a raw error string from the Rust side / agent to one of the
 * ROADMAP.md M5 panel error states. Matching is on text because ACP
 * agents don't give structured error codes for these. */
export function classifyError(raw: string): ChatError {
  if (/usage limit|rate limit|quota|too many requests/i.test(raw)) {
    return {
      kind: "usage_limit",
      message:
        "You've hit your ChatGPT plan's Codex usage limit. Try again once it resets.",
    };
  }
  if (/unauthori[sz]ed|not logged in|log ?in|sign in|authenticat/i.test(raw)) {
    return {
      kind: "logged_out",
      message: "Codex isn't signed in. Sign in with ChatGPT to continue.",
    };
  }
  if (/stopped responding/i.test(raw)) {
    return {
      kind: "timeout",
      message:
        "The agent stopped responding, so Yomu gave up on this answer. Retry starts a fresh session.",
    };
  }
  if (/exited|closed before responding|broken pipe/i.test(raw)) {
    return {
      kind: "adapter_crashed",
      message: "The Codex adapter stopped unexpectedly. Retry restarts it.",
    };
  }
  if (/could not start|not available|no such file|not found/i.test(raw)) {
    return {
      kind: "adapter_missing",
      message:
        "Couldn't start the Codex adapter. It runs through Node's `npx`, so make sure Node.js is installed.",
    };
  }
  return { kind: "other", message: raw };
}

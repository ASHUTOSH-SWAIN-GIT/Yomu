/**
 * Mirrors `src-tauri/src/agent/status.rs` and `src-tauri/src/agent/events.rs`.
 * Event fields are snake_case (`session_id`, not `sessionId`) because
 * `AgentEvent` is serialized straight off the Rust enum with no field
 * renaming — everything else in this app uses camelCase, this is the
 * one deliberate exception.
 */

export type AgentStatus = "missing" | "logged_out" | "ready";

export type AgentEvent =
  | { kind: "token"; session_id: string; text: string }
  | { kind: "done"; session_id: string }
  | { kind: "permission_request"; session_id: string; description: string };

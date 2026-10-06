/**
 * Mirrors `src-tauri/src/agent/status.rs` and `src-tauri/src/agent/events.rs`.
 * Event fields are snake_case (`session_id`, not `sessionId`) because
 * `AgentEvent` is serialized straight off the Rust enum with no field
 * renaming — everything else in this app uses camelCase, this is the
 * one deliberate exception.
 */

/** Mirrors `Diagnosis` in `src-tauri/src/agent/status.rs`. */
export interface Diagnosis {
  /** Node.js version, when Node and `npx` both work. */
  node: string | null;
  /** Codex CLI version, when `codex` is on PATH. */
  codex: string | null;
  loggedIn: boolean;
}

/** Mirrors `StorageInfo` in `src-tauri/src/lib.rs`. */
export interface StorageInfo {
  dataDir: string;
  databaseBytes: number;
  imagesBytes: number;
  imagesCount: number;
}

/** Mirrors `AgentConfig` in `src-tauri/src/agent/config.rs`: which agent
 * Yomu talks to. */
export type AgentConfig =
  | { kind: "codex" }
  | {
      kind: "custom";
      command: string;
      args: string[];
      /** Folders the agent keeps its own state in; the sandbox lets it read
       * and write there. */
      dataDirs: string[];
    };

/** Mirrors `ModelInfo' in `src-tauri/src/agent/harness.rs`. */
export interface AgentModel {
  /** What the agent takes to select it, e.g. `gpt-5.5[low]`. */
  id: string;
  name: string;
  description: string;
}

export type AgentEvent =
  | { kind: "token"; session_id: string; text: string }
  | { kind: "done"; session_id: string }
  | { kind: "permission_request"; session_id: string; description: string };

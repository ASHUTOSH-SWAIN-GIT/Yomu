# 1. ACP client lives in the Rust core

**Status**: accepted

- The app spawns the agent adapter from Rust (`src-tauri/src/agent/`) and speaks a small subset of ACP over stdio: `initialize`, `session/new`, `session/resume`, `session/set_mode`, `session/prompt`, plus `session/update` and `session/request_permission` from the agent.
- Chosen over a Node sidecar: no extra bundled runtime, and the process lifecycle (spawn, crash restart, kill on quit) sits next to the rest of the desktop shell.
- Hand rolled JSON-RPC (`agent/rpc.rs`) instead of an ACP crate: the subset is small and testable against a mock (`scripts/mock-acp-agent.mjs`).
- Everything goes through `AgentHarness`, so another ACP agent only needs a different command.

# 2. Detect and guide Codex install, do not bundle it

**Status**: accepted for v1, revisit later

- `agent_status` checks for `codex` on `PATH` and runs `codex login status`. The onboarding panel guides install and sign in.
- The ACP adapter (`@agentclientprotocol/codex-acp`, pinned) is launched through `npx`, so Node.js is also required.
- Bundling was rejected for v1: it means shipping and updating a binary we don't own, and licensing/terms questions are still open (see ROADMAP.md M6).
- GUI launches don't inherit the shell `PATH`, so `env::inherit_shell_path` merges the login shell's `PATH` at startup.

# 3. ACP instead of Codex's own app server protocol

**Status**: accepted

- ACP is agent neutral, so Gemini or Claude can be added later without a new client.
- Trade-off: the Codex adapter is a separate package that can lag Codex releases (the old `@zed-industries/codex-acp` already broke on current Codex and was replaced by `@agentclientprotocol/codex-acp`). Mitigation: pin the version, watch upstream, keep the app server protocol as a fallback.
- Explain sessions are switched to `read-only` mode on creation; permission requests are always denied (`agent/rpc.rs`). `read-only` still permits writes inside the session's empty temp cwd, which is why that directory is always fresh and empty.

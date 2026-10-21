mod config;
mod errors;
// Policy code is plain data and is tested everywhere; only Linux applies it.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod confine;
mod events;
mod harness;
mod rpc;
#[cfg(target_os = "macos")]
mod sandbox;
mod status;
#[cfg(test)]
mod tests;

pub use config::AgentConfig;
pub use errors::AgentError;
pub use events::AgentEvent;
pub use harness::{AgentHarness, ModelInfo};
pub use status::{diagnose, login, resolve_command, Diagnosis};

/// The one folder outside home that an agent may write in: its own private
/// scratch (also the parent of every session's working directory). Agents
/// such as OpenCode create files here as they start — OpenCode's Bun runtime
/// makes `$TMPDIR/opencode` — so without it they refuse to boot at all. The
/// agent is pointed at it with `TMPDIR`, keeping the system temp folder shut.
pub fn scratch_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("yomu-agent-sessions")
}

/// Whether the agent runs inside an operating-system sandbox on this
/// computer (see `sandbox.rs` for macOS, `confine.rs` for Linux). Where it
/// does not, the agent has the user's own permissions.
pub fn sandboxed() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/usr/bin/sandbox-exec").exists()
    }
    #[cfg(target_os = "linux")]
    {
        confine::available()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

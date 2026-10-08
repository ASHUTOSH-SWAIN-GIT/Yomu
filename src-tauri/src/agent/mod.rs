mod config;
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
pub use events::AgentEvent;
pub use harness::{AgentHarness, ModelInfo};
pub use status::{diagnose, login, resolve_command, Diagnosis};

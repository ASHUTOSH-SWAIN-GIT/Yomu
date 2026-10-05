use serde::{Deserialize, Serialize};

/// Which agent Yomu talks to. Codex is the built-in choice; a custom agent
/// is any program that speaks ACP (the Agent Client Protocol) over stdio.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AgentConfig {
    #[default]
    Codex,
    #[serde(rename_all = "camelCase")]
    Custom {
        /// The program: a name on `PATH`, or a full path.
        command: String,
        args: Vec<String>,
        /// Folders the agent keeps its own state in (for example its
        /// sign-in), which the sandbox lets it read and write.
        data_dirs: Vec<String>,
    },
}

impl AgentConfig {
    pub fn is_codex(&self) -> bool {
        matches!(self, AgentConfig::Codex)
    }
}

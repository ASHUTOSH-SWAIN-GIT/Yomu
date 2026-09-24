use serde::{Deserialize, Serialize};

/// Normalized stream events the frontend chat panel consumes, regardless
/// of which ACP agent produced them (see ROADMAP.md M4: "Normalize events
/// for the UI: token, done, permission_request").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentEvent {
    Token {
        session_id: String,
        text: String,
    },
    Done {
        session_id: String,
    },
    /// An agent asked to do something outside the read-only sandbox
    /// (write a file, run a command). We answer "denied" ourselves
    /// before this ever reaches the UI — see rpc.rs — and only
    /// surface it here so the chat panel can explain why an action
    /// didn't happen.
    PermissionRequest {
        session_id: String,
        description: String,
    },
}

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
    /// The model's reasoning, as it streams (`agent_thought_chunk`).
    Thought {
        session_id: String,
        text: String,
    },
    /// A step the agent is taking (a search, a read): `tool_call` when it
    /// starts, `tool_call_update` as it moves on. An update may leave out
    /// what did not change.
    Step {
        session_id: String,
        id: String,
        title: Option<String>,
        status: Option<String>,
    },
    /// The agent's own to-do list for the turn.
    Plan {
        session_id: String,
        entries: Vec<PlanEntry>,
    },
    /// How much of the model's context window is used.
    Usage {
        session_id: String,
        used: u64,
        size: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanEntry {
    pub content: String,
    pub status: String,
}

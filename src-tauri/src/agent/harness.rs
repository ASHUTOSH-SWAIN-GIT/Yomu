use std::path::Path;
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

use super::events::AgentEvent;
use super::rpc::RpcClient;

/// Command used to launch the ACP agent adapter. This targets the Codex
/// ACP adapter package name from ROADMAP.md; not verified against a real
/// install (no Codex in this dev sandbox — see status.rs). Wrapping
/// everything behind this one constant plus the notification mapping
/// below is the "swappable agent layer" from ROADMAP.md: pointing this
/// at a different ACP adapter is the whole change needed to try Claude
/// or Gemini once one of those is available.
const AGENT_COMMAND: &str = "codex-acp";

fn default_command() -> Option<Command> {
    Some(Command::new(AGENT_COMMAND))
}

/// Owns the ACP agent subprocess and turns its raw JSON-RPC notifications
/// into normalized [`AgentEvent`]s. One process is shared across all
/// sessions; ACP sessions are lightweight (see `new_session`).
pub struct AgentHarness {
    client: Mutex<Option<Arc<RpcClient>>>,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
    // A factory rather than a fixed command so tests can point this at
    // `scripts/mock-acp-agent.mjs` instead of the real `codex-acp`
    // binary (see agent/tests.rs). `None` means "not available".
    command_factory: fn() -> Option<Command>,
}

impl AgentHarness {
    pub fn new(event_tx: mpsc::UnboundedSender<AgentEvent>) -> Self {
        Self {
            client: Mutex::new(None),
            event_tx,
            command_factory: default_command,
        }
    }

    #[cfg(test)]
    pub fn new_for_tests(
        event_tx: mpsc::UnboundedSender<AgentEvent>,
        command_factory: fn() -> Option<Command>,
    ) -> Self {
        Self {
            client: Mutex::new(None),
            event_tx,
            command_factory,
        }
    }

    /// Returns the current connection, starting (or restarting, if the
    /// previous process died) the agent subprocess as needed.
    async fn connection(&self) -> Result<Arc<RpcClient>, String> {
        let mut guard = self.client.lock().await;

        if let Some(client) = guard.as_ref() {
            if !client.has_exited().await {
                return Ok(Arc::clone(client));
            }
            // Previous process crashed or exited; fall through and
            // respawn (ROADMAP.md: "Restart the adapter if it crashes").
        }

        let command = (self.command_factory)()
            .ok_or_else(|| format!("`{AGENT_COMMAND}` is not installed"))?;
        let client = Arc::new(spawn_agent(command, self.event_tx.clone())?);
        // Best effort handshake; some adapters may not implement this
        // exact method name, so a failure here isn't fatal.
        let _ = client
            .request("initialize", json!({ "protocolVersion": "1" }))
            .await;

        *guard = Some(Arc::clone(&client));
        Ok(client)
    }

    /// Opens a new ACP session rooted at `cwd`. Callers must pass an
    /// empty temp directory for explain sessions (ROADMAP.md M4 Safety:
    /// "Run in an empty temp working directory, never the user's
    /// projects") — the harness doesn't create it itself so the caller
    /// stays in control of cleanup.
    pub async fn new_session(&self, cwd: &Path) -> Result<String, String> {
        let client = self.connection().await?;
        let result = client
            .request("session/new", json!({ "cwd": cwd.to_string_lossy() }))
            .await?;

        result
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "agent did not return a sessionId".to_string())
    }

    /// Sends a prompt in an existing session. Resolves once the agent
    /// signals the turn is complete; the actual text arrives as `Token`
    /// events on the event channel passed to [`AgentHarness::new`] while
    /// this is in flight.
    pub async fn prompt(&self, session_id: &str, text: &str) -> Result<(), String> {
        let client = self.connection().await?;
        client
            .request(
                "session/prompt",
                json!({
                    "sessionId": session_id,
                    "prompt": [{ "type": "text", "text": text }],
                }),
            )
            .await
            .map(|_| ())
    }

    /// Kills the agent subprocess, if one is running.
    pub async fn shutdown(&self) {
        if let Some(client) = self.client.lock().await.take() {
            client.kill().await;
        }
    }
}

/// Spawns the agent and routes its `session/update` notifications into
/// normalized [`AgentEvent`]s. Everything else is dropped: this app
/// doesn't need the full ACP surface, only enough to drive one prompt at
/// a time per session.
fn spawn_agent(
    command: Command,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
) -> Result<RpcClient, String> {
    let (notification_tx, mut notification_rx) = mpsc::unbounded_channel::<(String, Value)>();

    tokio::spawn(async move {
        while let Some((method, params)) = notification_rx.recv().await {
            if method != "session/update" {
                continue;
            }
            if let Some(event) = parse_session_update(&params) {
                let _ = event_tx.send(event);
            }
        }
    });

    RpcClient::spawn(command, notification_tx)
        .map_err(|e| format!("could not start the agent (`{AGENT_COMMAND}`): {e}"))
}

fn parse_session_update(params: &Value) -> Option<AgentEvent> {
    let session_id = params.get("sessionId")?.as_str()?.to_string();
    let update = params.get("update")?;
    let kind = update.get("kind")?.as_str()?;

    Some(match kind {
        "token" => AgentEvent::Token {
            session_id,
            text: update.get("text")?.as_str()?.to_string(),
        },
        "done" => AgentEvent::Done { session_id },
        "error" => AgentEvent::Error {
            session_id,
            message: update
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("agent error")
                .to_string(),
        },
        // Explain sessions run read-only in an empty temp dir (see
        // `new_session`), so this is surfaced for visibility but never
        // acted on — there is deliberately no code path that grants one.
        "permission_request" => AgentEvent::PermissionRequest {
            session_id,
            description: update
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("requested a permission")
                .to_string(),
        },
        _ => return None,
    })
}

#[cfg(test)]
pub(super) fn parse_session_update_for_tests(params: &Value) -> Option<AgentEvent> {
    parse_session_update(params)
}

use std::path::Path;
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

use super::events::AgentEvent;
use super::rpc::{NotificationSender, RpcClient};

/// Real Codex ACP adapter, pinned (ROADMAP.md risk: "pin versions").
/// This constant plus the notification mapping below is the "swappable
/// agent layer": another ACP adapter (Claude, Gemini) only needs a
/// different command here.
const AGENT_LABEL: &str = "@agentclientprotocol/codex-acp";

/// Builds the command that starts the agent, OS-sandboxed on macOS
/// (`agent/sandbox.rs`) so file writes are denied (bar npm/Codex state dirs)
/// regardless of what Codex's own
/// (unenforced -- see `sandbox.rs`'s doc comment) sandbox policy claims.
fn default_command() -> Option<Command> {
    #[cfg(target_os = "macos")]
    {
        let profile = super::sandbox::profile();
        let mut command = Command::new("sandbox-exec");
        // Node fails outright if its own working directory is unreadable, and
        // the read lock covers home, so never inherit the app's cwd.
        command
            .current_dir(std::env::temp_dir())
            .arg("-p")
            .arg(profile)
            .arg("--")
            .arg("npx")
            .args(["-y", "@agentclientprotocol/codex-acp@1.13.1"]);
        Some(command)
    }
    #[cfg(not(target_os = "macos"))]
    {
        // TODO(ROADMAP.md M4): no OS-level write/network confinement on
        // this platform yet. Linux (Landlock/bubblewrap) and Windows
        // (AppContainer) equivalents are a known, documented gap -- Codex's
        // own declared sandbox isn't a substitute (see sandbox.rs's doc
        // comment for why). Runs unconfined until one is built.
        let mut command = Command::new("npx");
        command.args(["-y", "@agentclientprotocol/codex-acp@1.13.1"]);
        Some(command)
    }
}

/// Synthetic notification the harness injects after a prompt resolves.
/// Real ACP has no "done" notification (the prompt response carries the
/// stop reason), and sending it through the same channel as the chunks
/// guarantees `Done` can't overtake the last token.
const TURN_FINISHED: &str = "yomu/turn_finished";

/// Owns the ACP agent subprocess and turns its raw JSON-RPC notifications
/// into normalized [`AgentEvent`]s. One process is shared across all
/// sessions; ACP sessions are lightweight (see `new_session`).
pub struct AgentHarness {
    client: Mutex<Option<Connection>>,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
    // A factory rather than a fixed command so tests can point this at
    // `scripts/mock-acp-agent.mjs` instead of the real `codex-acp`
    // binary (see agent/tests.rs). `None` means "not available". Boxed
    // (rather than a bare `fn`).
    command_factory: Box<dyn Fn() -> Option<Command> + Send + Sync>,
}

#[derive(Clone)]
struct Connection {
    client: Arc<RpcClient>,
    notify_tx: NotificationSender,
}

impl AgentHarness {
    pub fn new(event_tx: mpsc::UnboundedSender<AgentEvent>) -> Self {
        Self {
            client: Mutex::new(None),
            event_tx,
            command_factory: Box::new(default_command),
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
            command_factory: Box::new(command_factory),
        }
    }

    /// Returns the current connection, starting (or restarting, if the
    /// previous process died) the agent subprocess as needed.
    async fn connection(&self) -> Result<Connection, String> {
        let mut guard = self.client.lock().await;

        if let Some(conn) = guard.as_ref() {
            if !conn.client.has_exited().await {
                return Ok(conn.clone());
            }
            // Previous process crashed or exited; fall through and
            // respawn (ROADMAP.md: "Restart the adapter if it crashes").
        }

        let command =
            (self.command_factory)().ok_or_else(|| format!("`{AGENT_LABEL}` is not available"))?;
        let conn = spawn_agent(command, self.event_tx.clone()).inspect_err(|e| {
            log::error!("{e}");
        })?;
        // No fs/terminal capabilities: the agent can't ask us to touch
        // files or run commands, on top of the read-only mode below.
        conn.client
            .request(
                "initialize",
                json!({ "protocolVersion": 1, "clientCapabilities": {} }),
            )
            .await
            .inspect_err(|e| log::error!("agent initialize failed: {e}"))?;

        *guard = Some(conn.clone());
        Ok(conn)
    }

    /// Opens a new ACP session rooted at `cwd`. Callers must pass an
    /// empty temp directory (ROADMAP.md M4 Safety) — the harness doesn't
    /// create it so the caller stays in control of cleanup.
    pub async fn new_session(&self, cwd: &Path) -> Result<String, String> {
        let conn = self.connection().await?;
        let result = conn
            .client
            .request(
                "session/new",
                json!({ "cwd": cwd.to_string_lossy(), "mcpServers": [] }),
            )
            .await?;
        let session_id = result
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "agent did not return a sessionId".to_string())?;

        lock_down(&conn.client, &session_id).await?;
        Ok(session_id)
    }

    /// Re-attaches to a session from a previous app run so a follow up
    /// keeps its context. Fails if the agent no longer has it; callers
    /// then fall back to `new_session`.
    pub async fn resume_session(&self, session_id: &str, cwd: &Path) -> Result<(), String> {
        let conn = self.connection().await?;
        conn.client
            .request(
                "session/resume",
                json!({
                    "sessionId": session_id,
                    "cwd": cwd.to_string_lossy(),
                    "mcpServers": [],
                }),
            )
            .await?;
        lock_down(&conn.client, session_id).await
    }

    /// Sends a prompt in an existing session. Text arrives as `Token`
    /// events while this is in flight; `Done` is emitted once the turn
    /// ends. Failures are returned, not emitted.
    pub async fn prompt(&self, session_id: &str, text: &str) -> Result<(), String> {
        self.prompt_with_image(session_id, text, None).await
    }

    /// Like [`prompt`](Self::prompt), attaching an image (ACP `image`
    /// content block: base64 data plus MIME type) after the text.
    pub async fn prompt_with_image(
        &self,
        session_id: &str,
        text: &str,
        image: Option<(&str, &str)>,
    ) -> Result<(), String> {
        let conn = self.connection().await?;
        let mut parts = vec![json!({ "type": "text", "text": text })];
        if let Some((mime, base64)) = image {
            parts.push(json!({ "type": "image", "data": base64, "mimeType": mime }));
        }
        conn.client
            .request(
                "session/prompt",
                json!({ "sessionId": session_id, "prompt": parts }),
            )
            .await
            .inspect_err(|e| log::error!("prompt failed: {e}"))?;
        let _ = conn.notify_tx.send((
            TURN_FINISHED.to_string(),
            json!({ "sessionId": session_id }),
        ));
        Ok(())
    }

    /// Starts the agent process ahead of the first prompt so the user
    /// doesn't pay the `npx` startup on their first Explain. Safe to call
    /// repeatedly; a no-op if it's already running.
    pub async fn warm(&self) -> Result<(), String> {
        let started = std::time::Instant::now();
        self.connection().await?;
        log::info!("agent ready after {} ms", started.elapsed().as_millis());
        Ok(())
    }

    /// Asks the agent to stop the turn in flight. The pending `prompt`
    /// then resolves normally (stop reason "cancelled"), so the text
    /// streamed so far still arrives followed by `Done`.
    pub async fn cancel(&self, session_id: &str) -> Result<(), String> {
        let conn = self.connection().await?;
        conn.client
            .notify("session/cancel", json!({ "sessionId": session_id }))
            .await
    }

    /// Kills the agent subprocess, if one is running.
    pub async fn shutdown(&self) {
        if let Some(conn) = self.client.lock().await.take() {
            conn.client.kill().await;
        }
    }
}

/// Codex's default mode auto-approves actions; explain sessions must be
/// read-only (ROADMAP.md M4 Safety). Failing here fails the session
/// rather than running it unrestricted.
async fn lock_down(client: &RpcClient, session_id: &str) -> Result<(), String> {
    client
        .request(
            "session/set_mode",
            json!({ "sessionId": session_id, "modeId": "read-only" }),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("could not switch the session to read-only: {e}"))
}

/// Spawns the agent and routes its notifications into normalized
/// [`AgentEvent`]s. Everything else is dropped: this app only needs
/// enough of ACP to drive one prompt at a time per session.
fn spawn_agent(
    command: Command,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
) -> Result<Connection, String> {
    let (notify_tx, mut notification_rx) = mpsc::unbounded_channel::<(String, Value)>();

    tokio::spawn(async move {
        while let Some((method, params)) = notification_rx.recv().await {
            if let Some(event) = parse_notification(&method, &params) {
                let _ = event_tx.send(event);
            }
        }
    });

    let client = RpcClient::spawn(command, notify_tx.clone())
        .map_err(|e| format!("could not start the agent (`{AGENT_LABEL}`, needs Node/npx): {e}"))?;
    Ok(Connection {
        client: Arc::new(client),
        notify_tx,
    })
}

fn parse_notification(method: &str, params: &Value) -> Option<AgentEvent> {
    let session_id = params.get("sessionId")?.as_str()?.to_string();

    match method {
        TURN_FINISHED => Some(AgentEvent::Done { session_id }),
        "session/update" => {
            let update = params.get("update")?;
            if update.get("sessionUpdate")?.as_str()? != "agent_message_chunk" {
                return None;
            }
            let content = update.get("content")?;
            if content.get("type")?.as_str()? != "text" {
                return None;
            }
            Some(AgentEvent::Token {
                session_id,
                text: content.get("text")?.as_str()?.to_string(),
            })
        }
        // Already denied in rpc.rs; surfaced so the UI can say why an
        // action didn't happen.
        "session/request_permission" => Some(AgentEvent::PermissionRequest {
            session_id,
            description: params
                .pointer("/toolCall/title")
                .and_then(Value::as_str)
                .unwrap_or("perform an action")
                .to_string(),
        }),
        _ => None,
    }
}

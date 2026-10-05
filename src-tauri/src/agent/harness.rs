use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};

use serde::Serialize;
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
    // Which models the account offers, and which it turned down this run.
    // Held only for short, non-async updates.
    models: StdMutex<ModelState>,
}

/// A model the account can use, for the picker in the chat.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ModelInfo {
    /// What `session/set_model` takes, e.g. `gpt-5.5[low]` (name + effort).
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Default)]
struct ModelState {
    /// Model ids (`name[effort]`) from the latest session, best first.
    available: Vec<String>,
    /// Display name and description per id, when the agent gave them.
    labels: std::collections::HashMap<String, (String, String)>,
    /// Model names the account rejected a prompt on; never picked again.
    rejected: HashSet<String>,
}

/// How many models to try for one prompt before giving up.
const MAX_MODEL_SWITCHES: usize = 4;

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
            models: StdMutex::default(),
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
            models: StdMutex::default(),
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
        self.use_supported_model(&conn.client, &session_id, &result)
            .await;
        Ok(session_id)
    }

    /// Re-attaches to a session from a previous app run so a follow up
    /// keeps its context. Fails if the agent no longer has it; callers
    /// then fall back to `new_session`.
    pub async fn resume_session(&self, session_id: &str, cwd: &Path) -> Result<(), String> {
        let conn = self.connection().await?;
        let result = conn
            .client
            .request(
                "session/resume",
                json!({
                    "sessionId": session_id,
                    "cwd": cwd.to_string_lossy(),
                    "mcpServers": [],
                }),
            )
            .await?;
        lock_down(&conn.client, session_id).await?;
        self.use_supported_model(&conn.client, session_id, &result)
            .await;
        Ok(())
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
        let params = json!({ "sessionId": session_id, "prompt": parts });
        // A plan can turn a model down at prompt time even after the session
        // started on it. Switch to another model the account offers and ask
        // again, a few times at most.
        let mut tried = HashSet::new();
        loop {
            match conn.client.request("session/prompt", params.clone()).await {
                Ok(_) => break,
                Err(e) => {
                    if is_model_rejected(&e)
                        && tried.len() < MAX_MODEL_SWITCHES
                        && self
                            .switch_model(&conn.client, session_id, &e, &mut tried)
                            .await
                    {
                        continue;
                    }
                    log::error!("prompt failed: {e}");
                    return Err(e);
                }
            }
        }
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

impl AgentHarness {
    fn record_models(&self, models: &Value) {
        let available: Vec<String> = models
            .get("availableModels")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|m| m.get("modelId").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        if available.is_empty() {
            return;
        }
        let labels = models
            .get("availableModels")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|m| {
                        let id = m.get("modelId").and_then(Value::as_str)?;
                        let text = |key: &str| {
                            m.get(key)
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string()
                        };
                        Some((id.to_string(), (text("name"), text("description"))))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut state = self.models.lock().unwrap();
        state.available = available;
        state.labels = labels;
    }

    /// The models the account offers (minus any it turned down), for the
    /// picker. The agent only reports them when a session starts, so with
    /// none known yet a throwaway session in `cwd` learns them.
    pub async fn list_models(&self, cwd: &Path) -> Result<Vec<ModelInfo>, String> {
        if self.models.lock().unwrap().available.is_empty() {
            self.new_session(cwd).await?;
        }
        let usable = self.usable_models();
        let state = self.models.lock().unwrap();
        Ok(usable
            .into_iter()
            .map(|id| {
                let (name, description) = state.labels.get(&id).cloned().unwrap_or_default();
                ModelInfo {
                    name: if name.is_empty() { id.clone() } else { name },
                    description,
                    id,
                }
            })
            .collect())
    }

    /// Moves a session to a model the user picked.
    pub async fn select_model(&self, session_id: &str, model_id: &str) -> Result<(), String> {
        let conn = self.connection().await?;
        conn.client
            .request(
                "session/set_model",
                json!({ "sessionId": session_id, "modelId": model_id }),
            )
            .await
            .map(|_| ())
    }

    /// The offered models minus any the account rejected this run.
    fn usable_models(&self) -> Vec<String> {
        let state = self.models.lock().unwrap();
        state
            .available
            .iter()
            .filter(|m| !state.rejected.contains(model_name(m)))
            .cloned()
            .collect()
    }

    async fn set_model(&self, client: &RpcClient, session_id: &str, model: &str) -> bool {
        match client
            .request(
                "session/set_model",
                json!({ "sessionId": session_id, "modelId": model }),
            )
            .await
        {
            Ok(_) => true,
            Err(e) => {
                log::warn!("could not switch to {model}: {e}");
                false
            }
        }
    }

    /// Codex takes its model from the user's own `~/.codex/config.toml`, which
    /// may name one their ChatGPT plan can't use (every prompt then fails with
    /// "model not supported"). A new or resumed session reports the model it
    /// is on and the models the account offers; when the first isn't among the
    /// second, switch to one that is. A failed switch is only logged: the
    /// prompt then reports the real error.
    async fn use_supported_model(&self, client: &RpcClient, session_id: &str, session: &Value) {
        let Some(models) = session.get("models") else {
            return;
        };
        self.record_models(models);
        let current = models.get("currentModelId").and_then(Value::as_str);
        let usable = self.usable_models();
        let usable: Vec<&str> = usable.iter().map(String::as_str).collect();
        let Some(pick) = pick_model(current, &usable) else {
            return;
        };
        log::warn!("model {current:?} is not offered to this account; using {pick}");
        self.set_model(client, session_id, &pick).await;
    }

    /// After a prompt was turned down for its model: remember that model as
    /// unusable, move the session to the next offered one, and say whether
    /// there was one to move to. `tried` keeps one prompt from circling.
    async fn switch_model(
        &self,
        client: &RpcClient,
        session_id: &str,
        error: &str,
        tried: &mut HashSet<String>,
    ) -> bool {
        if let Some(name) = rejected_model(error) {
            self.models.lock().unwrap().rejected.insert(name.clone());
            tried.insert(name);
        }
        let Some(pick) = self
            .usable_models()
            .into_iter()
            .find(|m| !tried.contains(model_name(m)))
        else {
            return false;
        };
        tried.insert(model_name(&pick).to_string());
        log::warn!("model turned down for this account; trying {pick}");
        self.set_model(client, session_id, &pick).await
    }
}

fn model_name(id: &str) -> &str {
    id.split('[').next().unwrap_or(id)
}

/// The agent's error for a model the account can't use, e.g. "The
/// 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT
/// account."
fn is_model_rejected(error: &str) -> bool {
    let error = error.to_lowercase();
    error.contains("model") && error.contains("not supported")
}

/// The model named in quotes in such an error, if any.
fn rejected_model(error: &str) -> Option<String> {
    let name = error.split('\'').nth(1)?.trim();
    (!name.is_empty() && name.len() < 64 && !name.contains(' ')).then(|| name.to_string())
}

/// The model to switch to, or `None` when the current one is usable. Model
/// ids look like `gpt-5.5[low]` (name plus reasoning effort); a model whose
/// name is offered at any effort is usable. Otherwise take the first offered
/// model at the same effort, so the user's speed preference is kept.
fn pick_model(current: Option<&str>, available: &[&str]) -> Option<String> {
    let name = model_name;
    fn effort(id: &str) -> Option<&str> {
        id.split_once('[')?.1.strip_suffix(']')
    }
    let current = current?;
    if available.is_empty() || available.iter().any(|m| name(m) == name(current)) {
        return None;
    }
    available
        .iter()
        .find(|m| effort(m) == effort(current))
        .or(available.first())
        .map(|m| m.to_string())
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

#[cfg(test)]
mod model_tests {
    use super::pick_model;

    const OFFERED: [&str; 4] = ["luna[low]", "luna[high]", "gpt-5.5[low]", "gpt-5.5[high]"];

    #[test]
    fn keeps_a_model_the_account_offers() {
        assert_eq!(pick_model(Some("gpt-5.5[high]"), &OFFERED), None);
        // Offered at other efforts is still the same model.
        assert_eq!(pick_model(Some("luna[xhigh]"), &OFFERED), None);
    }

    #[test]
    fn switches_to_the_same_effort_of_an_offered_model() {
        assert_eq!(
            pick_model(Some("sol[high]"), &OFFERED),
            Some("luna[high]".to_string())
        );
        assert_eq!(
            pick_model(Some("sol[low]"), &OFFERED),
            Some("luna[low]".to_string())
        );
    }

    #[test]
    fn falls_back_to_the_first_offered_model() {
        assert_eq!(
            pick_model(Some("sol[ultra]"), &OFFERED),
            Some("luna[low]".to_string())
        );
        assert_eq!(
            pick_model(Some("sol"), &OFFERED),
            Some("luna[low]".to_string())
        );
    }

    #[test]
    fn does_nothing_without_information() {
        assert_eq!(pick_model(None, &OFFERED), None);
        assert_eq!(pick_model(Some("sol[low]"), &[]), None);
    }
}

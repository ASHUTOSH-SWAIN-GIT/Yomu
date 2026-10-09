use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

use super::config::AgentConfig;
use super::events::{AgentEvent, PlanEntry};
use super::rpc::{NotificationSender, RpcClient, MCP_SERVER_NAME};
use crate::mcp::McpInfo;

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
        let mut command = Command::new("npx");
        command.args(["-y", "@agentclientprotocol/codex-acp@1.13.1"]);
        Some(confined(command, &[], &[]))
    }
}

/// Starts `command` inside the same rules as macOS where this system can
/// enforce them: Landlock on Linux (see `confine.rs`). Windows has no
/// equivalent built yet (see docs/windows-sandbox.md), and an older Linux
/// kernel has no Landlock; there the agent runs as it is, and says so in
/// the log. `read` and `write` are a custom agent's own folders.
#[cfg(not(target_os = "macos"))]
#[cfg_attr(not(target_os = "linux"), allow(unused_mut))]
fn confined(
    mut command: Command,
    read: &[std::path::PathBuf],
    write: &[std::path::PathBuf],
) -> Command {
    #[cfg(target_os = "linux")]
    {
        if super::confine::available() {
            let policy = super::confine::policy_for_this_machine(read, write);
            if let Err(e) = super::confine::confine(command.as_std_mut(), &policy) {
                log::warn!("{e}; the agent runs without the sandbox");
            }
            // Node fails if its working directory is unreadable, and home
            // is locked, so never inherit the app's.
            command.current_dir(std::env::temp_dir());
        } else {
            log::warn!("this kernel has no Landlock; the agent runs without the sandbox");
        }
    }
    #[cfg(not(target_os = "linux"))]
    log::warn!("no sandbox for the agent on this system yet");
    let _ = (read, write);
    command
}

/// Builds the command for an agent the user set up, in the same sandbox as
/// Codex where there is one: writes denied everywhere except its own data
/// folder, and reads of home limited to the program's folder and that data
/// folder.
fn custom_command(command: &str, args: &[String], data_dirs: &[String]) -> Option<Command> {
    let command = command.trim();
    if command.is_empty() {
        return None;
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let expand = |p: &str| match (p.strip_prefix("~/"), &home) {
        (Some(rest), Some(h)) => h.join(rest),
        _ => std::path::PathBuf::from(p),
    };
    let program_dir = super::status::resolve_command(command)
        .and_then(|p| p.parent().map(std::path::Path::to_path_buf));
    // An argument that is itself a file (`node ~/agents/my-agent.js`) is
    // part of the program, so its folder is readable too -- unless that
    // folder is the home folder itself, which would unlock everything.
    let script_dirs = args
        .iter()
        .map(|a| expand(a))
        .filter(|p| p.is_file())
        .filter_map(|p| p.parent().map(std::path::Path::to_path_buf))
        .filter(|dir| Some(dir) != home.as_ref());
    let read: Vec<_> = program_dir.into_iter().chain(script_dirs).collect();
    let write: Vec<_> = data_dirs
        .iter()
        .map(|d| d.trim())
        .filter(|d| !d.is_empty())
        .map(expand)
        .collect();
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("sandbox-exec");
        cmd.current_dir(std::env::temp_dir())
            .arg("-p")
            .arg(super::sandbox::profile_with(&read, &write))
            .arg("--")
            .arg(command)
            .args(args.iter().map(|a| expand(a)));
        Some(cmd)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut cmd = Command::new(command);
        cmd.args(args.iter().map(|a| expand(a)));
        Some(confined(cmd, &read, &write))
    }
}

fn command_for(config: &AgentConfig) -> Option<Command> {
    match config {
        AgentConfig::Codex => default_command(),
        AgentConfig::Custom {
            command,
            args,
            data_dirs,
        } => custom_command(command, args, data_dirs),
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
    /// Which agent to start; changed from the settings.
    config: Arc<StdMutex<AgentConfig>>,
    /// When each session last sent anything, to tell a slow turn from one
    /// that has hung.
    activity: Arc<StdMutex<HashMap<String, Instant>>>,
    /// How long a turn may stay silent before it is given up on.
    idle_timeout: Duration,
    /// Where Yomu's library server is, once it has started; given to every
    /// session of an agent that can use it.
    mcp: StdMutex<Option<McpInfo>>,
}

/// A turn that sends nothing (no words, thoughts or steps) for this long is
/// treated as hung. Generous, because a model can think for a while before
/// its first word.
const TURN_IDLE_TIMEOUT: Duration = Duration::from_secs(180);
/// How often a running turn is checked against the timeout.
const IDLE_CHECK: Duration = Duration::from_millis(250);

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
    /// The agent said (at `initialize`) that it can use an MCP server over
    /// HTTP.
    http_mcp: bool,
}

impl AgentHarness {
    pub fn new(event_tx: mpsc::UnboundedSender<AgentEvent>) -> Self {
        let config = Arc::new(StdMutex::new(AgentConfig::default()));
        let for_factory = Arc::clone(&config);
        Self {
            client: Mutex::new(None),
            event_tx,
            command_factory: Box::new(move || command_for(&for_factory.lock().unwrap())),
            models: StdMutex::default(),
            config,
            activity: Arc::default(),
            idle_timeout: TURN_IDLE_TIMEOUT,
            mcp: StdMutex::default(),
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
            config: Arc::new(StdMutex::new(AgentConfig::default())),
            activity: Arc::default(),
            idle_timeout: TURN_IDLE_TIMEOUT,
            mcp: StdMutex::default(),
        }
    }

    /// What to call the agent in a message: "Codex", or the program's name
    /// for one the user set up.
    fn agent_name(&self) -> String {
        match &*self.config.lock().unwrap() {
            AgentConfig::Codex => "Codex".to_string(),
            AgentConfig::Custom { command, .. } => std::path::Path::new(command.trim())
                .file_name()
                .map_or_else(
                    || "The agent".to_string(),
                    |n| n.to_string_lossy().into_owned(),
                ),
        }
    }

    /// Turns a raw error into one the chat can act on (see `errors.rs`).
    pub fn explain_error(&self, raw: String) -> super::errors::AgentError {
        super::errors::classify(&raw, &self.agent_name())
    }

    /// Tells the harness where Yomu's library server is. Sessions started
    /// from now on can look the library up themselves.
    pub fn set_mcp(&self, info: McpInfo) {
        *self.mcp.lock().unwrap() = Some(info);
    }

    /// The `mcpServers` list for a new or resumed session: Yomu's library
    /// server when there is one and the agent can use it, else nothing.
    fn mcp_servers(&self, conn: &Connection) -> Value {
        match (&*self.mcp.lock().unwrap(), conn.http_mcp) {
            (Some(info), true) => json!([{
                "type": "http",
                "name": MCP_SERVER_NAME,
                "url": info.url,
                "headers": [{ "name": "Authorization", "value": format!("Bearer {}", info.token) }],
            }]),
            _ => json!([]),
        }
    }

    /// For tests: a short silence limit, so a hung turn fails fast.
    #[cfg(test)]
    pub fn with_idle_timeout(mut self, idle_timeout: Duration) -> Self {
        self.idle_timeout = idle_timeout;
        self
    }

    /// Switches to another agent: stops the current one and forgets what it
    /// knew about models. The next call starts the new one.
    pub async fn set_agent(&self, config: AgentConfig) {
        *self.config.lock().unwrap() = config;
        self.shutdown().await;
        *self.models.lock().unwrap() = ModelState::default();
    }

    /// Switches to `config` and starts it, so a wrong command or a program
    /// that does not speak ACP shows up now, not at the first question.
    pub async fn use_agent(&self, config: AgentConfig) -> Result<(), String> {
        self.set_agent(config).await;
        self.warm().await
    }

    fn is_codex(&self) -> bool {
        self.config.lock().unwrap().is_codex()
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
        let conn = spawn_agent(command, self.event_tx.clone(), Arc::clone(&self.activity))
            .inspect_err(|e| {
                log::error!("{e}");
            })?;
        // No fs/terminal capabilities: the agent can't ask us to touch
        // files or run commands, on top of the read-only mode below.
        let init = conn
            .client
            .request(
                "initialize",
                json!({ "protocolVersion": 1, "clientCapabilities": {} }),
            )
            .await
            .inspect_err(|e| log::error!("agent initialize failed: {e}"))?;
        let conn = Connection {
            http_mcp: init
                .pointer("/agentCapabilities/mcpCapabilities/http")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            ..conn
        };

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
                json!({ "cwd": cwd.to_string_lossy(), "mcpServers": self.mcp_servers(&conn) }),
            )
            .await?;
        let session_id = result
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "agent did not return a sessionId".to_string())?;

        lock_down(&conn.client, &session_id, self.is_codex()).await?;
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
                    "mcpServers": self.mcp_servers(&conn),
                }),
            )
            .await?;
        lock_down(&conn.client, session_id, self.is_codex()).await?;
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
            match self.prompt_request(&conn, session_id, params.clone()).await {
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

    /// Sends `session/prompt` and waits for the turn to end, but gives up
    /// (and asks the agent to stop) if the session goes quiet for longer than
    /// the idle timeout, so a hung agent cannot freeze a chat forever.
    async fn prompt_request(
        &self,
        conn: &Connection,
        session_id: &str,
        params: Value,
    ) -> Result<Value, String> {
        self.touch(session_id);
        let request = conn.client.request("session/prompt", params);
        tokio::pin!(request);
        loop {
            tokio::select! {
                result = &mut request => return result,
                _ = tokio::time::sleep(IDLE_CHECK) => {
                    if self.idle_for(session_id) > self.idle_timeout {
                        let _ = conn
                            .client
                            .notify("session/cancel", json!({ "sessionId": session_id }))
                            .await;
                        log::error!("agent went quiet for {:?}; giving up on the turn", self.idle_timeout);
                        return Err(format!(
                            "The agent stopped responding (nothing for {} seconds).",
                            self.idle_timeout.as_secs()
                        ));
                    }
                }
            }
        }
    }

    fn touch(&self, session_id: &str) {
        self.activity
            .lock()
            .unwrap()
            .insert(session_id.to_string(), Instant::now());
    }

    fn idle_for(&self, session_id: &str) -> Duration {
        self.activity
            .lock()
            .unwrap()
            .get(session_id)
            .map_or(Duration::ZERO, Instant::elapsed)
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
/// read-only (ROADMAP.md M4 Safety). For Codex, failing here fails the
/// session rather than running it unrestricted. Another agent may not have a
/// mode by that name, so there it is requested but not required: the OS
/// sandbox around its process is what actually keeps it from writing.
async fn lock_down(client: &RpcClient, session_id: &str, required: bool) -> Result<(), String> {
    let result = client
        .request(
            "session/set_mode",
            json!({ "sessionId": session_id, "modeId": "read-only" }),
        )
        .await;
    match result {
        Ok(_) => Ok(()),
        Err(e) if required => Err(format!("could not switch the session to read-only: {e}")),
        Err(e) => {
            log::warn!("the agent has no read-only mode ({e}); relying on the sandbox");
            Ok(())
        }
    }
}

impl AgentHarness {
    /// Remembers the models a new or resumed session reports.
    fn record_models(&self, session: &Value) {
        let models = models_in(session);
        if models.is_empty() {
            return;
        }
        let mut state = self.models.lock().unwrap();
        state.available = models.iter().map(|m| m.id.clone()).collect();
        state.labels = models
            .into_iter()
            .map(|m| (m.id, (m.name, m.description)))
            .collect();
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
        // Codex takes `session/set_model`; other agents (OpenCode, ...) list
        // their models as a config option and change it that way.
        let (method, params) = if self.is_codex() {
            (
                "session/set_model",
                json!({ "sessionId": session_id, "modelId": model_id }),
            )
        } else {
            (
                "session/set_config_option",
                json!({ "sessionId": session_id, "configId": "model", "value": model_id }),
            )
        };
        conn.client.request(method, params).await.map(|_| ())
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
        self.record_models(session);
        let Some(models) = session.get("models") else {
            return;
        };
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

/// The models a session response offers, in the agent's order. Codex puts
/// them in `models.availableModels`; other ACP agents in the `model` entry of
/// `configOptions`.
fn models_in(session: &Value) -> Vec<ModelInfo> {
    let text = |m: &Value, key: &str| {
        m.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    if let Some(list) = session
        .pointer("/models/availableModels")
        .and_then(Value::as_array)
    {
        return list
            .iter()
            .filter_map(|m| {
                let id = m.get("modelId").and_then(Value::as_str)?;
                Some(ModelInfo {
                    id: id.to_string(),
                    name: text(m, "name"),
                    description: text(m, "description"),
                })
            })
            .collect();
    }
    session
        .get("configOptions")
        .and_then(Value::as_array)
        .and_then(|options| {
            options.iter().find(|o| {
                o.get("category").and_then(Value::as_str) == Some("model")
                    || o.get("id").and_then(Value::as_str) == Some("model")
            })
        })
        .and_then(|o| o.get("options").and_then(Value::as_array))
        .map(|list| {
            list.iter()
                .filter_map(|m| {
                    let id = m.get("value").and_then(Value::as_str)?;
                    Some(ModelInfo {
                        id: id.to_string(),
                        name: text(m, "name"),
                        description: text(m, "description"),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
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
    activity: Arc<StdMutex<HashMap<String, Instant>>>,
) -> Result<Connection, String> {
    let (notify_tx, mut notification_rx) = mpsc::unbounded_channel::<(String, Value)>();

    tokio::spawn(async move {
        while let Some((method, params)) = notification_rx.recv().await {
            // Anything from a session shows it is alive.
            if let Some(id) = params.get("sessionId").and_then(Value::as_str) {
                activity
                    .lock()
                    .unwrap()
                    .insert(id.to_string(), Instant::now());
            }
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
        http_mcp: false,
    })
}

fn parse_notification(method: &str, params: &Value) -> Option<AgentEvent> {
    let session_id = params.get("sessionId")?.as_str()?.to_string();

    match method {
        TURN_FINISHED => Some(AgentEvent::Done { session_id }),
        "session/update" => {
            let update = params.get("update")?;
            let text_of = |update: &Value| -> Option<String> {
                let content = update.get("content")?;
                if content.get("type")?.as_str()? != "text" {
                    return None;
                }
                Some(content.get("text")?.as_str()?.to_string())
            };
            let string_at = |key: &str| update.get(key).and_then(Value::as_str).map(str::to_string);
            match update.get("sessionUpdate")?.as_str()? {
                "agent_message_chunk" => Some(AgentEvent::Token {
                    session_id,
                    text: text_of(update)?,
                }),
                "agent_thought_chunk" => Some(AgentEvent::Thought {
                    session_id,
                    text: text_of(update)?,
                }),
                "tool_call" | "tool_call_update" => Some(AgentEvent::Step {
                    session_id,
                    id: string_at("toolCallId")?,
                    title: string_at("title"),
                    status: string_at("status"),
                }),
                "plan" => Some(AgentEvent::Plan {
                    session_id,
                    entries: update
                        .get("entries")?
                        .as_array()?
                        .iter()
                        .filter_map(|e| {
                            Some(PlanEntry {
                                content: e.get("content")?.as_str()?.to_string(),
                                status: e
                                    .get("status")
                                    .and_then(Value::as_str)
                                    .unwrap_or("pending")
                                    .to_string(),
                            })
                        })
                        .collect(),
                }),
                "usage_update" => Some(AgentEvent::Usage {
                    session_id,
                    used: update.get("used")?.as_u64()?,
                    size: update.get("size")?.as_u64()?,
                }),
                _ => None,
            }
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
    use super::{models_in, pick_model};
    use serde_json::json;

    #[test]
    fn reads_models_from_either_shape() {
        let codex = json!({ "models": { "availableModels": [
            { "modelId": "gpt-5.5[low]", "name": "5.5 (low)", "description": "d" }
        ]}});
        let m = models_in(&codex);
        assert_eq!(
            (m[0].id.as_str(), m[0].name.as_str()),
            ("gpt-5.5[low]", "5.5 (low)")
        );

        let other = json!({ "configOptions": [
            { "id": "mode", "category": "mode", "options": [{ "value": "x", "name": "X" }] },
            { "id": "model", "category": "model", "options": [
                { "value": "p/a", "name": "A" }, { "value": "p/b", "name": "B" }
            ]}
        ]});
        let ids: Vec<_> = models_in(&other).into_iter().map(|m| m.id).collect();
        assert_eq!(ids, ["p/a", "p/b"]);
        assert!(models_in(&json!({ "sessionId": "s" })).is_empty());
    }

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

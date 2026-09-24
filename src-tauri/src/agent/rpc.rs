//! A minimal JSON-RPC 2.0 client over a child process's stdio, in the
//! spirit of ACP ("LSP for agents"): newline-delimited JSON objects on
//! stdin/stdout, requests matched to responses by id, everything else
//! treated as a notification and routed by method name.
//!
//! This is hand rolled rather than built on a third party ACP crate: the
//! subset of ACP this app needs is small, and it stays testable against a
//! mock agent (see `scripts/mock-acp-agent.mjs` and `agent/tests.rs`)
//! without a real Codex install in CI.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

pub type NotificationSender = mpsc::UnboundedSender<(String, Value)>;
type PendingRequests = Arc<Mutex<HashMap<i64, oneshot::Sender<Result<Value, String>>>>>;

#[derive(Debug, Deserialize)]
struct IncomingMessage {
    // A `Value` rather than `i64` so requests *from* the agent can be
    // answered with whatever id type it chose.
    #[serde(default)]
    id: Option<Value>,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    params: Value,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<Value>,
}

pub struct RpcClient {
    child: Mutex<Child>,
    stdin: Arc<Mutex<ChildStdin>>,
    next_id: AtomicI64,
    pending: PendingRequests,
}

impl RpcClient {
    /// Spawns `command` and starts reading its stdout in the background.
    /// Every notification, and every request the agent makes of us (a
    /// message with a `method`), is forwarded on `notifications` as
    /// `(method, params)`. Requests are also answered here, see
    /// [`reply_to_agent_request`].
    pub fn spawn(mut command: Command, notifications: NotificationSender) -> std::io::Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Belt and suspenders for "kill all child processes on app
            // quit" (ROADMAP.md M4 lifecycle): the child dies when this
            // Child value is dropped, which happens when the whole app
            // process exits and drops all its state.
            .kill_on_drop(true);

        let mut child = command.spawn()?;
        let stdin = child.stdin.take().expect("stdin was piped");
        let stdout = child.stdout.take().expect("stdout was piped");
        let stderr = child.stderr.take().expect("stderr was piped");

        let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
        let stdin = Arc::new(Mutex::new(stdin));

        spawn_reader(
            stdout,
            Arc::clone(&pending),
            notifications,
            Arc::clone(&stdin),
        );
        spawn_stderr_logger(stderr);

        Ok(RpcClient {
            child: Mutex::new(child),
            stdin,
            next_id: AtomicI64::new(1),
            pending,
        })
    }

    /// Sends a request and waits for its matching response.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        let payload = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        self.write_line(&payload).await.map_err(|e| {
            if let Ok(mut p) = self.pending.try_lock() {
                p.remove(&id);
            }
            format!("failed to write to agent process: {e}")
        })?;

        rx.await
            .map_err(|_| "agent process closed before responding".to_string())?
    }

    /// Sends a notification (no `id`, no response expected).
    pub async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.write_line(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
            .await
            .map_err(|e| format!("failed to write to agent process: {e}"))
    }

    async fn write_line(&self, payload: &Value) -> std::io::Result<()> {
        let mut line = serde_json::to_vec(payload).expect("Value always serializes");
        line.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(&line).await?;
        stdin.flush().await
    }

    /// True if the child process has already exited.
    pub async fn has_exited(&self) -> bool {
        matches!(self.child.lock().await.try_wait(), Ok(Some(_)))
    }

    pub async fn kill(&self) {
        let _ = self.child.lock().await.kill().await;
    }
}

fn spawn_reader(
    stdout: tokio::process::ChildStdout,
    pending: PendingRequests,
    notifications: NotificationSender,
    stdin: Arc<Mutex<ChildStdin>>,
) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            let line = match lines.next_line().await {
                Ok(Some(line)) => line,
                Ok(None) => break, // stdout closed, process exited
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }

            let message: IncomingMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(_) => continue, // not JSON-RPC we understand, ignore
            };

            match (message.id, message.method) {
                (Some(id), None) => {
                    // A response to one of our requests.
                    let Some(id) = id.as_i64() else { continue };
                    if let Some(sender) = pending.lock().await.remove(&id) {
                        let result = if let Some(err) = message.error {
                            Err(err
                                .get("message")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .unwrap_or_else(|| err.to_string()))
                        } else {
                            Ok(message.result.unwrap_or(Value::Null))
                        };
                        let _ = sender.send(result);
                    }
                }
                (Some(id), Some(method)) => {
                    // The agent is asking *us* for something. Always
                    // answer, or the agent's turn hangs waiting on us.
                    let reply = reply_to_agent_request(&method, id);
                    let _ = notifications.send((method, message.params));
                    let mut line = serde_json::to_vec(&reply).expect("Value always serializes");
                    line.push(b'\n');
                    let mut stdin = stdin.lock().await;
                    let _ = stdin.write_all(&line).await;
                    let _ = stdin.flush().await;
                }
                (None, Some(method)) => {
                    let _ = notifications.send((method, message.params));
                }
                _ => {}
            }
        }

        // The agent's stdout closed (crashed or exited). Fail every
        // in-flight request instead of leaving its caller hanging
        // forever — the harness treats this as "needs a respawn".
        for (_, sender) in pending.lock().await.drain() {
            let _ = sender.send(Err("agent process exited".to_string()));
        }
    });
}

/// Answers a request from the agent. This is where the M4 safety rule
/// "default deny" lives: permission requests are always cancelled, and
/// since the client advertises no `fs`/`terminal` capabilities, anything
/// else is "method not found".
fn reply_to_agent_request(method: &str, id: Value) -> Value {
    if method == "session/request_permission" {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "outcome": { "outcome": "cancelled" } },
        })
    } else {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": format!("method not supported: {method}") },
        })
    }
}

fn spawn_stderr_logger(stderr: tokio::process::ChildStderr) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // The agent's stderr is useful for debugging a failed
            // connection but isn't part of the protocol.
            log::debug!("[agent stderr] {line}");
        }
    });
}

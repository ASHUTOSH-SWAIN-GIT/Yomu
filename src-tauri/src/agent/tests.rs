//! The ACP spike from ROADMAP.md Phase 0 ("throwaway script that spawns
//! the adapter, opens a session, sends a prompt, prints streamed
//! updates"), kept as an automated test instead of a throwaway script.
//!
//! It runs against `scripts/mock-acp-agent.mjs` rather than a real
//! Codex install: this dev sandbox has no `codex` binary and no way to
//! sign in to ChatGPT, so the mock is what proves the Rust side (process
//! spawn, JSON-RPC framing, session lifecycle, streaming) actually
//! works end to end. Swapping in the real Codex ACP adapter is a matter
//! of pointing `AGENT_COMMAND` at it — see harness.rs.

use std::path::PathBuf;
use std::time::Duration;

use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::timeout;

use super::events::AgentEvent;
use super::harness::AgentHarness;

fn mock_agent_command() -> Option<Command> {
    if which("node").is_none() {
        eprintln!("skipping ACP spike test: `node` not found on PATH");
        return None;
    }

    let script = repo_root().join("scripts/mock-acp-agent.mjs");
    if !script.exists() {
        eprintln!("skipping ACP spike test: {script:?} not found");
        return None;
    }

    let mut command = Command::new("node");
    command.arg(script);
    Some(command)
}

fn which(bin: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(bin))
            .find(|candidate| candidate.is_file())
    })
}

fn repo_root() -> PathBuf {
    // src-tauri/src/agent/tests.rs -> src-tauri/src/agent -> src-tauri -> repo root
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent directory")
        .to_path_buf()
}

#[tokio::test]
async fn spike_streams_tokens_from_a_prompt() {
    let Some(command) = mock_agent_command() else {
        return;
    };

    // Reimplement just enough of harness::spawn_agent here to point at
    // the mock instead of AGENT_COMMAND, while exercising the same
    // RpcClient + notification-parsing path the real harness uses.
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AgentEvent>();
    let (notification_tx, mut notification_rx) =
        mpsc::unbounded_channel::<(String, serde_json::Value)>();

    tokio::spawn(async move {
        while let Some((method, params)) = notification_rx.recv().await {
            if method == "session/update" {
                if let Some(event) = super::harness::parse_session_update_for_tests(&params) {
                    let _ = event_tx.send(event);
                }
            }
        }
    });

    let client = super::rpc::RpcClient::spawn(command, notification_tx)
        .expect("mock agent process should spawn");

    let init = client
        .request("initialize", serde_json::json!({ "protocolVersion": "1" }))
        .await
        .expect("initialize should succeed");
    assert_eq!(init["protocolVersion"], "1");

    let temp_dir = std::env::temp_dir().join("yomu-acp-spike-test");
    let session = client
        .request(
            "session/new",
            serde_json::json!({ "cwd": temp_dir.to_string_lossy() }),
        )
        .await
        .expect("session/new should succeed");
    let session_id = session["sessionId"]
        .as_str()
        .expect("sessionId")
        .to_string();
    assert!(session_id.starts_with("mock-session-"));

    let prompt_future = client.request(
        "session/prompt",
        serde_json::json!({
            "sessionId": session_id,
            "prompt": [{ "type": "text", "text": "hello" }],
        }),
    );

    let (prompt_result, streamed) = tokio::join!(prompt_future, collect_until_done(&mut event_rx));

    prompt_result.expect("session/prompt should succeed");

    let tokens: String = streamed
        .iter()
        .filter_map(|e| match e {
            AgentEvent::Token { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(tokens.trim(), "You said: hello");
    assert!(matches!(streamed.last(), Some(AgentEvent::Done { .. })));

    client.kill().await;
}

async fn collect_until_done(rx: &mut mpsc::UnboundedReceiver<AgentEvent>) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    let result = timeout(Duration::from_secs(5), async {
        while let Some(event) = rx.recv().await {
            let done = matches!(event, AgentEvent::Done { .. });
            events.push(event);
            if done {
                break;
            }
        }
    })
    .await;
    assert!(result.is_ok(), "timed out waiting for the agent to finish");
    events
}

#[tokio::test]
async fn spike_recovers_a_session_error_gracefully() {
    let Some(command) = mock_agent_command() else {
        return;
    };

    let (notification_tx, _rx) = mpsc::unbounded_channel();
    let client = super::rpc::RpcClient::spawn(command, notification_tx)
        .expect("mock agent process should spawn");

    // Prompting a session id the agent has never seen exercises the
    // error path end to end (see mock-acp-agent.mjs's respondError).
    let result = client
        .request(
            "session/prompt",
            serde_json::json!({ "sessionId": "does-not-exist", "prompt": [] }),
        )
        .await;
    assert!(result.is_err());

    client.kill().await;
}

/// A minimal smoke test that `AgentHarness` itself (not just the raw
/// RpcClient) can drive a full session against the mock — this is the
/// same code path production Tauri commands call.
#[tokio::test]
async fn harness_opens_a_session_and_gets_a_response() {
    if mock_agent_command().is_none() {
        return;
    }

    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AgentEvent>();
    let harness = AgentHarness::new_for_tests(event_tx, mock_agent_command);

    let temp_dir = std::env::temp_dir().join("yomu-acp-harness-test");
    tokio::fs::create_dir_all(&temp_dir).await.unwrap();

    let session_id = harness
        .new_session(&temp_dir)
        .await
        .expect("new_session should succeed");

    harness
        .prompt(&session_id, "ping")
        .await
        .expect("prompt should succeed");

    let mut saw_done = false;
    let result = timeout(Duration::from_secs(5), async {
        while let Some(event) = event_rx.recv().await {
            if matches!(event, AgentEvent::Done { .. }) {
                saw_done = true;
                break;
            }
        }
    })
    .await;
    assert!(result.is_ok(), "timed out waiting for Done");
    assert!(saw_done);

    harness.shutdown().await;
}

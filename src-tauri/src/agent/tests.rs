//! ROADMAP.md Phase 0's ACP spike, kept as automated tests. They drive
//! `AgentHarness` (the same code path the Tauri commands use) against
//! `scripts/mock-acp-agent.mjs`, which speaks the real ACP message shapes
//! observed from `@agentclientprotocol/codex-acp` without needing a Codex
//! install or ChatGPT login in CI.

use std::path::PathBuf;
use std::time::Duration;

use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::timeout;

use super::events::AgentEvent;
use super::harness::AgentHarness;

fn mock_agent_command() -> Option<Command> {
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent directory")
        .join("scripts/mock-acp-agent.mjs");
    let mut command = Command::new("node");
    command.arg(script);
    Some(command)
}

struct Fixture {
    harness: AgentHarness,
    events: mpsc::UnboundedReceiver<AgentEvent>,
    cwd: PathBuf,
}

async fn fixture(name: &str) -> Fixture {
    let (tx, events) = mpsc::unbounded_channel();
    let cwd = std::env::temp_dir().join(format!("yomu-test-{name}"));
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    Fixture {
        harness: AgentHarness::new_for_tests(tx, mock_agent_command),
        events,
        cwd,
    }
}

/// Collects events up to and including the first `Done`.
async fn until_done(rx: &mut mpsc::UnboundedReceiver<AgentEvent>) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    let finished = timeout(Duration::from_secs(5), async {
        while let Some(event) = rx.recv().await {
            let done = matches!(event, AgentEvent::Done { .. });
            events.push(event);
            if done {
                break;
            }
        }
    })
    .await;
    assert!(finished.is_ok(), "timed out waiting for Done");
    events
}

fn joined_tokens(events: &[AgentEvent]) -> String {
    events
        .iter()
        .filter_map(|e| match e {
            AgentEvent::Token { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn streams_tokens_then_done_in_order() {
    let mut f = fixture("stream").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    // Also proves the session was switched to read-only: the mock
    // refuses to prompt otherwise.
    f.harness.prompt(&session, "hello").await.unwrap();

    let events = until_done(&mut f.events).await;
    assert_eq!(joined_tokens(&events).trim(), "You said: hello");
    assert!(matches!(events.last(), Some(AgentEvent::Done { .. })));
    f.harness.shutdown().await;
}

#[tokio::test]
async fn permission_requests_are_denied_and_surfaced() {
    let mut f = fixture("permission").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    f.harness
        .prompt(&session, "PERMISSION please")
        .await
        .unwrap();

    let events = until_done(&mut f.events).await;
    assert!(events.iter().any(|e| matches!(
        e,
        AgentEvent::PermissionRequest { description, .. } if description == "write a file"
    )));
    assert_eq!(
        joined_tokens(&events).trim(),
        "permission outcome: cancelled"
    );
    f.harness.shutdown().await;
}

#[tokio::test]
async fn resume_works_for_known_sessions_only() {
    let f = fixture("resume").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    f.harness.resume_session(&session, &f.cwd).await.unwrap();
    assert!(f.harness.resume_session("nope", &f.cwd).await.is_err());
    f.harness.shutdown().await;
}

#[tokio::test]
async fn agent_errors_reach_the_caller() {
    let f = fixture("errors").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    let err = f.harness.prompt(&session, "USAGE_LIMIT").await.unwrap_err();
    assert!(err.contains("usage limit"), "got: {err}");
    assert!(f.harness.prompt("does-not-exist", "hi").await.is_err());
    f.harness.shutdown().await;
}

#[tokio::test]
async fn cancel_stops_a_turn_early_but_still_finishes_it() {
    let mut f = fixture("cancel").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    let harness = std::sync::Arc::new(f.harness);
    let running = {
        let harness = harness.clone();
        let session = session.clone();
        tokio::spawn(async move { harness.prompt(&session, "SLOW please").await })
    };

    // Wait for the first token, then cancel.
    let first = timeout(Duration::from_secs(5), f.events.recv()).await;
    assert!(matches!(first, Ok(Some(AgentEvent::Token { .. }))));
    harness.cancel(&session).await.unwrap();

    running
        .await
        .unwrap()
        .expect("a cancelled turn still resolves Ok");
    let events = until_done(&mut f.events).await;
    // 200 words were queued; a cancel must cut that far short.
    assert!(joined_tokens(&events).matches("word").count() < 100);
    assert!(matches!(events.last(), Some(AgentEvent::Done { .. })));
    harness.shutdown().await;
}

/// Opt-in: talks to the real Codex adapter via `npx` and your ChatGPT
/// login, so it's slow and uses plan quota. Run with
/// `cargo test real_codex -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn real_codex_streams_and_resumes() {
    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    let cwd = std::env::temp_dir().join("yomu-test-real-codex");
    tokio::fs::create_dir_all(&cwd).await.unwrap();

    let session = harness.new_session(&cwd).await.unwrap();
    harness
        .prompt(&session, "Remember the word pineapple. Reply: ok")
        .await
        .unwrap();
    let first = until_done_with(&mut events, 120).await;
    assert!(!joined_tokens(&first).is_empty());

    harness.resume_session(&session, &cwd).await.unwrap();
    harness
        .prompt(&session, "What word did I ask you to remember?")
        .await
        .unwrap();
    let second = until_done_with(&mut events, 120).await;
    assert!(joined_tokens(&second).to_lowercase().contains("pineapple"));
    harness.shutdown().await;
}

async fn until_done_with(
    rx: &mut mpsc::UnboundedReceiver<AgentEvent>,
    secs: u64,
) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    timeout(Duration::from_secs(secs), async {
        while let Some(event) = rx.recv().await {
            let done = matches!(event, AgentEvent::Done { .. });
            events.push(event);
            if done {
                break;
            }
        }
    })
    .await
    .expect("timed out waiting for Done");
    events
}

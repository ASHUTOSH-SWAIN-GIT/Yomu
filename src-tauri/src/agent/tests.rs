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
async fn images_are_sent_as_acp_image_blocks_after_the_text() {
    let mut f = fixture("image").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    f.harness
        .prompt_with_image(&session, "what is this", Some(("image/png", "QUJD")))
        .await
        .unwrap();

    let events = until_done(&mut f.events).await;
    // The mock echoes the mime type and the length of the base64 data.
    assert_eq!(
        joined_tokens(&events).trim(),
        "You said: what is this [image image/png 4]"
    );
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

#[tokio::test]
async fn moves_off_a_model_the_account_does_not_offer() {
    let mut f = fixture("model-start").await;
    // The mock starts every session on a model it does not offer.
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "SHOW_MODEL").await.unwrap();
    let events = until_done(&mut f.events).await;
    assert_eq!(joined_tokens(&events).trim(), "model current[low]");
}

#[tokio::test]
async fn switches_again_when_a_prompt_is_turned_down() {
    let mut f = fixture("model-reject").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    // The first replacement is rejected at prompt time: the harness retries
    // on the next offered model without the caller seeing an error.
    f.harness
        .prompt(&session, "REJECT_MODEL SHOW_MODEL")
        .await
        .unwrap();
    let events = until_done(&mut f.events).await;
    assert!(joined_tokens(&events).contains("model backup[low]"));

    // And the rejected model is not picked again by later sessions.
    let next = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&next, "SHOW_MODEL").await.unwrap();
    let events = until_done(&mut f.events).await;
    assert_eq!(joined_tokens(&events).trim(), "model backup[low]");
}

#[tokio::test]
async fn reports_the_error_when_every_model_is_turned_down() {
    let f = fixture("model-none").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    // Every offered model is rejected in turn; the harness gives up and the
    // caller sees the agent's own error.
    let err = f.harness.prompt(&session, "REJECT_ALL").await.unwrap_err();
    assert!(err.contains("not supported"), "{err}");
}

#[tokio::test]
async fn lists_the_models_the_account_offers() {
    let f = fixture("model-list").await;
    // No session yet: listing learns the models from a throwaway one.
    let models = f.harness.list_models(&f.cwd).await.unwrap();
    let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["current[low]", "backup[low]"]);
    // The mock gives no display names, so the id stands in.
    assert_eq!(models[0].name, "current[low]");
}

#[tokio::test]
async fn a_picked_model_applies_to_the_session() {
    let mut f = fixture("model-pick").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness
        .select_model(&session, "backup[low]")
        .await
        .unwrap();
    f.harness.prompt(&session, "SHOW_MODEL").await.unwrap();
    let events = until_done(&mut f.events).await;
    assert_eq!(joined_tokens(&events).trim(), "model backup[low]");
}

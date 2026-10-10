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

use super::config::AgentConfig;
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

/// Opt-in: starts any ACP agent through the real harness (sandbox included)
/// and asks it one short question. For trying a preset before shipping it:
/// `YOMU_AGENT="opencode acp" YOMU_AGENT_DIRS="~/.local/share/opencode" cargo test real_custom_agent -- --ignored --nocapture`
#[tokio::test]
#[ignore]
async fn real_custom_agent() {
    let line = std::env::var("YOMU_AGENT").expect("set YOMU_AGENT to the command line");
    let mut words = line.split_whitespace().map(str::to_string);
    let command = words.next().expect("empty YOMU_AGENT");
    let data_dirs = std::env::var("YOMU_AGENT_DIRS")
        .unwrap_or_default()
        .split(',')
        .filter(|d| !d.trim().is_empty())
        .map(|d| d.trim().to_string())
        .collect();

    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    harness
        .use_agent(AgentConfig::Custom {
            command,
            args: words.collect(),
            data_dirs,
        })
        .await
        .expect("the agent did not start");
    let cwd = std::env::temp_dir().join("yomu-test-real-custom");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    let session = harness.new_session(&cwd).await.unwrap();
    harness
        .prompt(&session, "Reply with exactly one word: ok")
        .await
        .unwrap();
    let reply = joined_tokens(&until_done_with(&mut events, 180).await);
    println!("REPLY: {reply:?}");
    assert!(!reply.trim().is_empty());
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

#[tokio::test]
async fn a_custom_agent_that_cannot_start_is_reported_at_once() {
    use super::config::AgentConfig;
    // The real launcher (the fixtures use a mock), so the configured
    // command is the one that runs.
    let (tx, _events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    let started = harness.use_agent(AgentConfig::Custom {
        command: "definitely-not-a-real-program-xyz".into(),
        args: vec![],
        data_dirs: vec![],
    });
    let result = timeout(Duration::from_secs(10), started)
        .await
        .expect("should fail, not hang");
    assert!(result.is_err(), "{result:?}");
    // And an empty command is refused outright.
    let empty = harness
        .use_agent(AgentConfig::Custom {
            command: "  ".into(),
            args: vec![],
            data_dirs: vec![],
        })
        .await;
    assert!(empty.is_err());
}

#[tokio::test]
async fn a_custom_agent_runs_a_session_end_to_end() {
    use super::config::AgentConfig;
    // The mock agent started through the custom-agent path (and, on macOS,
    // the same sandbox as Codex), with its script in a folder the sandbox
    // would otherwise hide.
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("scripts/mock-acp-agent.mjs");
    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    harness
        .use_agent(AgentConfig::Custom {
            command: "node".into(),
            args: vec![script.to_string_lossy().into_owned()],
            data_dirs: vec![],
        })
        .await
        .expect("the custom agent should start");
    let cwd = std::env::temp_dir().join("yomu-test-custom-e2e");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    let session = harness.new_session(&cwd).await.unwrap();
    harness.prompt(&session, "hello custom").await.unwrap();
    let got = until_done(&mut events).await;
    assert!(joined_tokens(&got).contains("hello custom"));
    harness.shutdown().await;
}

/// Needs OpenCode installed and signed in: cargo test -- --ignored real_opencode
#[tokio::test]
#[ignore]
async fn real_opencode_streams_through_the_sandbox() {
    use super::config::AgentConfig;
    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    harness
        .use_agent(AgentConfig::Custom {
            command: "opencode".into(),
            args: vec!["acp".into()],
            data_dirs: vec![
                "~/.local/share/opencode".into(),
                "~/.local/state/opencode".into(),
                "~/.cache/opencode".into(),
                "~/.config/opencode".into(),
            ],
        })
        .await
        .expect("opencode should start");
    let cwd = std::env::temp_dir().join("yomu-test-opencode");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    let models = harness.list_models(&cwd).await.unwrap();
    println!("OPENCODE models: {}", models.len());
    let session = harness.new_session(&cwd).await.unwrap();
    harness
        .prompt(&session, "Reply with exactly one word: ok")
        .await
        .unwrap();
    let got = until_done(&mut events).await;
    println!("OPENCODE reply: {:?}", joined_tokens(&got));
    assert!(!joined_tokens(&got).trim().is_empty());
    harness.shutdown().await;
}

/// Needs Codex and OpenCode installed and signed in:
/// cargo test -- --ignored real_switch_between_agents
#[tokio::test]
#[ignore]
async fn real_switch_between_agents_changes_the_model_list() {
    use super::config::AgentConfig;
    let (tx, _events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    let cwd = std::env::temp_dir().join("yomu-test-switch");
    tokio::fs::create_dir_all(&cwd).await.unwrap();

    harness
        .use_agent(AgentConfig::Custom {
            command: "opencode".into(),
            args: vec!["acp".into()],
            data_dirs: vec![
                "~/.local/share/opencode".into(),
                "~/.local/state/opencode".into(),
                "~/.cache/opencode".into(),
                "~/.config/opencode".into(),
            ],
        })
        .await
        .expect("opencode should start");
    let opencode = harness.list_models(&cwd).await.unwrap();
    println!("SWITCH opencode models: {}", opencode.len());

    harness
        .use_agent(AgentConfig::Codex)
        .await
        .expect("codex should start");
    let codex = harness.list_models(&cwd).await.unwrap();
    println!(
        "SWITCH codex models: {} first: {:?}",
        codex.len(),
        codex.first().map(|m| m.id.clone())
    );
    assert_ne!(opencode.len(), codex.len());
    assert!(
        codex.iter().all(|m| !m.id.contains('/')),
        "codex ids have no provider prefix"
    );
    harness.shutdown().await;
}

#[tokio::test]
async fn forwards_thoughts_steps_plans_and_usage() {
    let mut f = fixture("rich").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "RICH").await.unwrap();
    let events = until_done(&mut f.events).await;

    assert!(events
        .iter()
        .any(|e| matches!(e, AgentEvent::Thought { text, .. } if text == "Let me look.")));
    // The start of a step names it; its update only says how it went.
    assert!(events.iter().any(|e| matches!(e,
        AgentEvent::Step { id, title: Some(t), status: Some(s), .. }
            if id == "t1" && t == "Search the library" && s == "pending")));
    assert!(events.iter().any(|e| matches!(e,
        AgentEvent::Step { id, title: None, status: Some(s), .. }
            if id == "t1" && s == "completed")));
    assert!(events.iter().any(|e| matches!(e,
        AgentEvent::Plan { entries, .. }
            if entries.len() == 1 && entries[0].content == "Answer"
                && entries[0].status == "in_progress")));
    assert!(events.iter().any(|e| matches!(
        e,
        AgentEvent::Usage {
            used: 1200,
            size: 200000,
            ..
        }
    )));
    // The words still arrive too.
    assert!(joined_tokens(&events).contains("RICH"));
}

#[tokio::test]
async fn a_hung_turn_is_given_up_on() {
    let (tx, _events) = mpsc::unbounded_channel();
    let cwd = std::env::temp_dir().join("yomu-test-stall");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    let harness = AgentHarness::new_for_tests(tx, mock_agent_command)
        .with_idle_timeout(Duration::from_millis(600));
    let session = harness.new_session(&cwd).await.unwrap();

    let started = std::time::Instant::now();
    let err = harness.prompt(&session, "STALL").await.unwrap_err();
    assert!(err.contains("stopped responding"), "{err}");
    assert!(started.elapsed() < Duration::from_secs(4));

    // The agent itself is fine: the next turn on a new session works.
    let next = harness.new_session(&cwd).await.unwrap();
    harness.prompt(&next, "hello").await.unwrap();
}

#[tokio::test]
async fn a_slow_turn_that_keeps_talking_is_not_cut_off() {
    let (tx, mut events) = mpsc::unbounded_channel();
    let cwd = std::env::temp_dir().join("yomu-test-slow-ok");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    // Longer than the limit overall (200 words at 20 ms), but never silent
    // for as long as the limit.
    let harness = AgentHarness::new_for_tests(tx, mock_agent_command)
        .with_idle_timeout(Duration::from_millis(800));
    let session = harness.new_session(&cwd).await.unwrap();
    harness.prompt(&session, "SLOW").await.unwrap();
    let events = until_done(&mut events).await;
    assert!(joined_tokens(&events).contains("word"));
}

fn library_server() -> crate::mcp::McpInfo {
    crate::mcp::McpInfo {
        url: "http://127.0.0.1:9/mcp".into(),
        token: "secret".into(),
    }
}

#[tokio::test]
async fn sessions_get_the_library_server_when_the_agent_can_use_it() {
    let mut f = fixture("mcp-given").await;
    f.harness.set_mcp(library_server());
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "SHOW_MCP").await.unwrap();
    let reply = joined_tokens(&until_done(&mut f.events).await);

    assert!(reply.contains(r#""name":"yomu""#), "{reply}");
    assert!(reply.contains(r#""type":"http""#));
    assert!(reply.contains("http://127.0.0.1:9/mcp"));
    assert!(reply.contains(r#""value":"Bearer secret""#));

    // A resumed session is given it again.
    f.harness.resume_session(&session, &f.cwd).await.unwrap();
    f.harness.prompt(&session, "SHOW_MCP").await.unwrap();
    assert!(joined_tokens(&until_done(&mut f.events).await).contains("Bearer secret"));
}

#[tokio::test]
async fn sessions_get_no_server_before_it_has_started() {
    let mut f = fixture("mcp-none").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "SHOW_MCP").await.unwrap();
    let reply = joined_tokens(&until_done(&mut f.events).await);
    assert!(reply.contains("mcp []"), "{reply}");
}

#[tokio::test]
async fn a_call_to_the_library_server_is_allowed_and_not_reported() {
    let mut f = fixture("mcp-allow").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "MCPCALL").await.unwrap();
    let events = until_done(&mut f.events).await;

    assert!(joined_tokens(&events).contains("call outcome: selected/allow_once"));
    // Nothing to apologise for, so the chat is not told of a refusal.
    assert!(!events
        .iter()
        .any(|e| matches!(e, AgentEvent::PermissionRequest { .. })));
    // The step itself is shown.
    assert!(events.iter().any(|e| matches!(e,
        AgentEvent::Step { title: Some(t), .. } if t == "mcp.yomu.search_library")));
}

#[tokio::test]
async fn a_call_to_any_other_tool_is_still_denied() {
    let mut f = fixture("mcp-deny").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();
    f.harness.prompt(&session, "OTHERCALL").await.unwrap();
    let events = until_done(&mut f.events).await;

    assert!(joined_tokens(&events).contains("call outcome: cancelled/-"));
    assert!(events
        .iter()
        .any(|e| matches!(e, AgentEvent::PermissionRequest { .. })));
}

/// Opt-in: the real Codex, through the real sandbox, using Yomu's library
/// server on a copy of the app's own database. Needs a signed-in Codex and a
/// database with saved blogs. `cargo test real_codex_uses_the_library -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn real_codex_uses_the_library_server() {
    let data = PathBuf::from(std::env::var("HOME").unwrap())
        .join("Library/Application Support/com.yomu.app");
    let copy = std::env::temp_dir().join("yomu-real-mcp");
    let _ = std::fs::remove_dir_all(&copy);
    std::fs::create_dir_all(&copy).unwrap();
    for name in ["yomu.db", "yomu.db-wal", "yomu.db-shm"] {
        let _ = std::fs::copy(data.join(name), copy.join(name));
    }

    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    harness.set_mcp(crate::mcp::start(copy.join("yomu.db")).await.unwrap());
    let cwd = std::env::temp_dir().join("yomu-test-real-mcp");
    tokio::fs::create_dir_all(&cwd).await.unwrap();

    let session = harness.new_session(&cwd).await.unwrap();
    harness
        .prompt(
            &session,
            "Use your yomu tools: call search_library for 'storage and compute', then answer in one sentence what the best blog says. Cite the article as a Markdown link whose address is yomu:<id>, or yomu:<id>#<paragraph> when you know the paragraph number (¶), for example [Inside Neon](yomu:abc123#12), using only ids you were given.",
        )
        .await
        .unwrap();
    let all = until_done_with(&mut events, 180).await;
    for e in &all {
        if !matches!(e, AgentEvent::Token { .. }) {
            println!("{e:?}");
        }
    }
    println!("REPLY: {}", joined_tokens(&all));
    assert!(all.iter().any(|e| matches!(e,
        AgentEvent::Step { title: Some(t), .. } if t.contains("yomu"))));
    // The answer points at a saved blog the way the chat can open.
    assert!(joined_tokens(&all).contains("](yomu:"), "no source link");
    assert!(!all
        .iter()
        .any(|e| matches!(e, AgentEvent::PermissionRequest { .. })));
    harness.shutdown().await;
}

#[tokio::test]
async fn fetching_a_web_page_is_allowed_but_running_a_command_is_not() {
    let mut f = fixture("web").await;
    let session = f.harness.new_session(&f.cwd).await.unwrap();

    f.harness.prompt(&session, "FETCHCALL").await.unwrap();
    let fetched = until_done(&mut f.events).await;
    assert!(joined_tokens(&fetched).contains("call outcome: selected/allow_once"));
    assert!(!fetched
        .iter()
        .any(|e| matches!(e, AgentEvent::PermissionRequest { .. })));

    f.harness.prompt(&session, "RUNCALL").await.unwrap();
    let ran = until_done(&mut f.events).await;
    assert!(joined_tokens(&ran).contains("call outcome: cancelled/-"));
    assert!(ran
        .iter()
        .any(|e| matches!(e, AgentEvent::PermissionRequest { .. })));
}

/// Opt-in: the real Codex, through the real sandbox, looks something up on
/// the web. `cargo test real_codex_can_use_the_web -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn real_codex_can_use_the_web() {
    let (tx, mut events) = mpsc::unbounded_channel();
    let harness = AgentHarness::new(tx);
    let cwd = std::env::temp_dir().join("yomu-test-real-web");
    tokio::fs::create_dir_all(&cwd).await.unwrap();
    let session = harness.new_session(&cwd).await.unwrap();
    harness
        .prompt(
            &session,
            "Look on the web for the title of the newest post on https://blog.rust-lang.org/ and reply with just that title and the URL you used.",
        )
        .await
        .unwrap();
    let all = until_done_with(&mut events, 180).await;
    for e in &all {
        if !matches!(e, AgentEvent::Token { .. }) {
            println!("{e:?}");
        }
    }
    println!("REPLY: {}", joined_tokens(&all));
    assert!(all.iter().any(|e| matches!(e, AgentEvent::Step { .. })));
    harness.shutdown().await;
}

#[tokio::test]
async fn errors_name_the_agent_that_is_in_use() {
    let f = fixture("error-names").await;
    let said = |h: &AgentHarness| h.explain_error("not logged in".into()).message;
    assert!(said(&f.harness).starts_with("Codex isn't signed in"));

    f.harness
        .set_agent(AgentConfig::Custom {
            command: "/opt/bin/opencode".into(),
            args: vec![],
            data_dirs: vec![],
        })
        .await;
    assert!(said(&f.harness).starts_with("opencode isn't signed in"));
}

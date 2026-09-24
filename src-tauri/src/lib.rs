mod agent;
mod db;
mod env;
mod scraper;

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use agent::{AgentHarness, Diagnosis};
use scraper::ScrapedArticle;
use tauri::Emitter;
use tokio::sync::mpsc;

#[tauri::command]
async fn scrape_url(app: tauri::AppHandle, url: String) -> Result<ScrapedArticle, String> {
    scraper::scrape(&url, Some(&app)).await.map_err(|e| {
        log::error!("scrape failed for {url}: {e}");
        e.to_string()
    })
}

/// Normalizes a URL without a network round trip, so the frontend can
/// check the local cache before deciding whether to call `scrape_url`.
#[tauri::command]
fn canonicalize_url(url: String) -> Result<String, String> {
    scraper::canonical_url(&url).map_err(|e| e.to_string())
}

/// What's installed and whether Codex is signed in, for the setup checklist.
#[tauri::command]
async fn agent_diagnose() -> Diagnosis {
    agent::diagnose().await
}

#[tauri::command]
async fn agent_login() -> Result<(), String> {
    agent::login().await
}

/// Creates a new, empty temp directory to use as an agent's working
/// directory — never a user project (ROADMAP.md M4 Safety).
async fn fresh_temp_dir() -> Result<std::path::PathBuf, String> {
    let dir_name = format!(
        "yomu-explain-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let cwd = std::env::temp_dir().join(dir_name);
    tokio::fs::create_dir_all(&cwd)
        .await
        .map_err(|e| format!("could not create a temp working directory: {e}"))?;
    Ok(cwd)
}

#[tauri::command]
async fn agent_new_session(harness: tauri::State<'_, Arc<AgentHarness>>) -> Result<String, String> {
    harness.new_session(&fresh_temp_dir().await?).await
}

/// Re-attaches to a session saved from an earlier app run (M5: "persist
/// acp_session_id to resume"). The frontend falls back to
/// `agent_new_session` if this errors.
#[tauri::command]
async fn agent_resume_session(
    session_id: String,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), String> {
    harness
        .resume_session(&session_id, &fresh_temp_dir().await?)
        .await
}

/// Starts the agent in the background so the first Explain is fast.
#[tauri::command]
async fn agent_warm(harness: tauri::State<'_, Arc<AgentHarness>>) -> Result<(), String> {
    harness.warm().await
}

#[tauri::command]
async fn agent_cancel(
    session_id: String,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), String> {
    harness.cancel(&session_id).await
}

#[tauri::command]
async fn agent_prompt(
    session_id: String,
    text: String,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), String> {
    harness.prompt(&session_id, &text).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env::inherit_shell_path();

    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<agent::AgentEvent>();
    let harness = Arc::new(AgentHarness::new(event_tx));
    let harness_for_exit = Arc::clone(&harness);

    tauri::Builder::default()
        // Local only: logs go to the OS app log dir, never off the machine
        // (ROADMAP.md M6 "crash and error logging (local only)").
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .manage(harness)
        .setup(move |app| {
            // Forwards normalized agent events (see agent/events.rs) to
            // the frontend as they arrive. The chat panel listens for
            // "agent-event" and filters by sessionId.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    let _ = app_handle.emit("agent-event", event);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scrape_url,
            canonicalize_url,
            agent_diagnose,
            agent_login,
            agent_new_session,
            agent_resume_session,
            agent_warm,
            agent_cancel,
            agent_prompt
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            // Explicit kill on quit (ROADMAP.md M4 lifecycle), on top of
            // `kill_on_drop` in agent/rpc.rs as a fallback.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                tauri::async_runtime::block_on(harness_for_exit.shutdown());
            }
        });
}

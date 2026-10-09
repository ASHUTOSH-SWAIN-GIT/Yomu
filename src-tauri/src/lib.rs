mod agent;
mod bookmarks;
mod db;
mod env;
mod imgcache;
mod mcp;
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

/// Downloads an article's images into the offline cache. Returns the cached
/// file name for each URL (same order), `null` where one couldn't be saved.
#[tauri::command]
async fn cache_images(
    app: tauri::AppHandle,
    urls: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    let client = scraper::http_client().map_err(|e| e.to_string())?;
    imgcache::cache_images(&client, &imgcache::images_dir(&app)?, &urls).await
}

/// Names of the files in the image cache, so the reader can tell which of an
/// article's saved images were since cleared out to keep the cache small.
#[tauri::command]
fn cached_image_names(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(imgcache::list_names(&imgcache::images_dir(&app)?))
}

/// Absolute path of the image cache directory (created if missing).
#[tauri::command]
async fn image_cache_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = imgcache::images_dir(&app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("could not create the image cache: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Where Yomu keeps its data and how much space it takes, for the settings.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    data_dir: String,
    database_bytes: u64,
    images_bytes: u64,
    images_count: usize,
}

#[tauri::command]
fn storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not find the app data directory: {e}"))?;
    // The database is one file plus SQLite's `-wal` and `-shm` companions.
    let database_bytes = std::fs::read_dir(&data_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.file_name().to_string_lossy().starts_with("yomu.db"))
                .filter_map(|e| e.metadata().ok())
                .map(|m| m.len())
                .sum()
        })
        .unwrap_or(0);
    let (images_bytes, images_count) = imgcache::dir_stats(&imgcache::images_dir(&app)?);
    Ok(StorageInfo {
        data_dir: data_dir.to_string_lossy().into_owned(),
        database_bytes,
        images_bytes,
        images_count,
    })
}

/// Deletes cached images that no article uses any more.
#[tauri::command]
async fn prune_images(app: tauri::AppHandle, keep: Vec<String>) -> Result<usize, String> {
    Ok(imgcache::prune(&imgcache::images_dir(&app)?, &keep))
}

/// Normalizes a URL without a network round trip, so the frontend can
/// check the local cache before deciding whether to call `scrape_url`.
/// Pages bookmarked into the browsers' "Yomu" folder (see bookmarks.rs).
#[tauri::command]
async fn scan_bookmarks(folder: String) -> Result<bookmarks::Scan, String> {
    tokio::task::spawn_blocking(move || bookmarks::scan(&folder))
        .await
        .map_err(|e| e.to_string())
}

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

/// Shared parent of every agent session's temp working directory.
fn sessions_root() -> std::path::PathBuf {
    std::env::temp_dir().join("yomu-agent-sessions")
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
    let cwd = sessions_root().join(dir_name);
    tokio::fs::create_dir_all(&cwd)
        .await
        .map_err(|e| format!("could not create a temp working directory: {e}"))?;
    Ok(cwd)
}

#[tauri::command]
async fn agent_new_session(
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<String, agent::AgentError> {
    let cwd = fresh_temp_dir().await.map_err(agent::AgentError::from)?;
    harness
        .new_session(&cwd)
        .await
        .map_err(|e| harness.explain_error(e))
}

/// Whether the agent runs inside an operating-system sandbox on this
/// computer; Settings says so when it does not.
#[tauri::command]
fn agent_sandboxed() -> bool {
    agent::sandboxed()
}

/// Re-attaches to a session saved from an earlier app run (M5: "persist
/// acp_session_id to resume"). The frontend falls back to
/// `agent_new_session` if this errors.
#[tauri::command]
async fn agent_resume_session(
    session_id: String,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), agent::AgentError> {
    let cwd = fresh_temp_dir().await.map_err(agent::AgentError::from)?;
    harness
        .resume_session(&session_id, &cwd)
        .await
        .map_err(|e| harness.explain_error(e))
}

/// Switches to the agent chosen in the settings and starts it, so a wrong
/// command shows up as an error now.
#[tauri::command]
async fn agent_use(
    config: agent::AgentConfig,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), String> {
    harness.use_agent(config).await
}

/// Whether a command exists, and where; for the custom agent field.
#[tauri::command]
fn agent_find_command(command: String) -> Option<String> {
    agent::resolve_command(&command).map(|p| p.to_string_lossy().into_owned())
}

/// The models the account can use, for the model picker in the chat.
#[tauri::command]
async fn agent_list_models(
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<Vec<agent::ModelInfo>, String> {
    harness.list_models(&fresh_temp_dir().await?).await
}

/// Moves a session to a model the user picked in the chat.
#[tauri::command]
async fn agent_set_model(
    session_id: String,
    model_id: String,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), String> {
    harness.select_model(&session_id, &model_id).await
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
    app: tauri::AppHandle,
    session_id: String,
    text: String,
    image_url: Option<String>,
    harness: tauri::State<'_, Arc<AgentHarness>>,
) -> Result<(), agent::AgentError> {
    let Some(url) = image_url else {
        return harness
            .prompt(&session_id, &text)
            .await
            .map_err(|e| harness.explain_error(e));
    };
    let client = scraper::http_client().map_err(|e| agent::AgentError::other(e.to_string()))?;
    let image = imgcache::load_for_agent(&client, &imgcache::images_dir(&app)?, &url)
        .await
        .map_err(agent::AgentError::from)?;
    harness
        .prompt_with_image(&session_id, &text, Some((image.mime, &image.base64)))
        .await
        .map_err(|e| harness.explain_error(e))
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
        .manage(Arc::clone(&harness))
        .setup(move |app| {
            // The library as a read-only server the agent can use (see
            // mcp.rs). If it cannot start the agent still works, with the
            // passages Yomu puts in each question.
            {
                use tauri::Manager;
                let db_path = app.path().app_data_dir()?.join("yomu.db");
                let harness = Arc::clone(&harness);
                tauri::async_runtime::spawn(async move {
                    match mcp::start(db_path).await {
                        Ok(info) => harness.set_mcp(info),
                        Err(e) => log::error!("{e}"),
                    }
                });
            }
            // Cmd+W closes a tab (handled in the page), so the default
            // menu's "Close Window" must not take that shortcut. The window
            // still closes with its red button and Cmd+Q.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItemKind, WINDOW_SUBMENU_ID};
                let menu = Menu::default(app.handle())?;
                if let Some(MenuItemKind::Submenu(window)) = menu.get(WINDOW_SUBMENU_ID) {
                    for item in window.items()? {
                        if let MenuItemKind::Predefined(p) = &item {
                            if p.text()? == "Close Window" {
                                window.remove(&item)?;
                            }
                        }
                    }
                }
                app.set_menu(menu)?;
            }
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
            cache_images,
            image_cache_dir,
            cached_image_names,
            prune_images,
            storage_info,
            agent_diagnose,
            agent_login,
            agent_new_session,
            agent_resume_session,
            agent_warm,
            agent_sandboxed,
            scan_bookmarks,
            agent_use,
            agent_find_command,
            agent_list_models,
            agent_set_model,
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

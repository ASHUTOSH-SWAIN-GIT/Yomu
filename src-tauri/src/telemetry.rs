//! Anonymous install count, so the author can see how many people use Yomu
//! and on which OS.
//!
//! What leaves the machine, once per launch: a random install id and the OS.
//! Nothing else. It is on by
//! default with a switch in Settings, and does nothing unless the build was
//! given `YOMU_TELEMETRY_URL` (so dev builds never send).

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Set at build time (see .github/workflows/release.yml).
const ENDPOINT: Option<&str> = option_env!("YOMU_TELEMETRY_URL");

#[derive(Serialize, Deserialize)]
struct Settings {
    id: String,
    enabled: bool,
}

fn file(app: &tauri::AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("telemetry.json"))
}

/// The saved choice, creating the install id on first use.
fn load(app: &tauri::AppHandle) -> Option<Settings> {
    let path = file(app)?;
    if let Some(s) = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
    {
        return Some(s);
    }
    let s = Settings {
        id: uuid::Uuid::new_v4().to_string(),
        enabled: true,
    };
    save(app, &s);
    Some(s)
}

fn save(app: &tauri::AppHandle, s: &Settings) {
    if let Some(path) = file(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(raw) = serde_json::to_string(s) {
            let _ = std::fs::write(path, raw);
        }
    }
}

/// Reports this install in the background. Failures are ignored: telemetry
/// must never slow down or break the app.
pub fn ping(app: &tauri::AppHandle) {
    // An unset CI variable arrives as an empty string.
    let Some(url) = ENDPOINT.filter(|u| !u.is_empty()) else {
        return;
    };
    let Some(settings) = load(app) else { return };
    if !settings.enabled {
        return;
    }
    let body = serde_json::json!({
        "id": settings.id,
        "os": std::env::consts::OS,
    });
    tauri::async_runtime::spawn(async move {
        let Ok(client) = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        else {
            return;
        };
        let _ = client
            .post(url)
            .header("content-type", "application/json")
            .body(body.to_string())
            .send()
            .await;
    });
}

#[tauri::command]
pub fn telemetry_enabled(app: tauri::AppHandle) -> bool {
    load(&app).map(|s| s.enabled).unwrap_or(false)
}

#[tauri::command]
pub fn telemetry_set_enabled(app: tauri::AppHandle, enabled: bool) {
    if let Some(mut s) = load(&app) {
        s.enabled = enabled;
        save(&app, &s);
    }
}

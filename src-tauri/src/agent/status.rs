use serde::Serialize;
use tokio::process::Command;

/// Binary the app looks for on `PATH`. Real Codex CLI's exact
/// subcommands for checking login state are unverified in this codebase
/// (no `codex` install available in the dev/CI sandbox this was built
/// in) — `detect()` below is a best effort guess at `codex login status`
/// and should be confirmed against a real install before shipping.
const CODEX_BIN: &str = "codex";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    /// `codex` isn't on PATH.
    Missing,
    /// `codex` is installed but not signed in to ChatGPT.
    LoggedOut,
    /// Installed and signed in; safe to open a session.
    Ready,
}

/// Checks whether Codex is installed and signed in. Never touches the
/// network itself — it only shells out to the local `codex` binary,
/// which owns its own auth (see ROADMAP.md M4 "Auth rules").
pub async fn detect() -> AgentStatus {
    let version = Command::new(CODEX_BIN).arg("--version").output().await;
    if version.is_err() {
        return AgentStatus::Missing;
    }

    // Best guess at how Codex reports login state. If this subcommand
    // doesn't exist on a real install, this falls back to "Ready" rather
    // than blocking the whole app on a wrong assumption — worth revisiting
    // once tested against the real CLI.
    match Command::new(CODEX_BIN)
        .args(["login", "status"])
        .output()
        .await
    {
        Ok(output) => {
            let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if !output.status.success()
                || text.contains("not logged in")
                || text.contains("logged out")
            {
                AgentStatus::LoggedOut
            } else {
                AgentStatus::Ready
            }
        }
        Err(_) => AgentStatus::Ready,
    }
}

/// Kicks off `codex login`, which is expected to open a browser itself.
/// This returns as soon as the process is spawned; the frontend re-polls
/// `agent_status` afterwards rather than waiting on this to finish.
pub async fn login() -> Result<(), String> {
    Command::new(CODEX_BIN)
        .arg("login")
        .spawn()
        .map_err(|e| format!("could not start `codex login`: {e}"))?;
    Ok(())
}

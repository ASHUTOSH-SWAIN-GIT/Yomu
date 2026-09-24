use serde::Serialize;
use tokio::process::Command;

/// Binary the app looks for on `PATH`.
const CODEX_BIN: &str = "codex";

/// What's installed on this machine, for the setup checklist. Each field
/// is a fix-it step the UI can show on its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    /// Node.js version, present only if `npx` also works (the Codex ACP
    /// adapter is launched through `npx`).
    pub node: Option<String>,
    /// Codex CLI version, if `codex` is on `PATH`.
    pub codex: Option<String>,
    pub logged_in: bool,
}

/// First line of `bin arg` stdout, if the command ran and succeeded.
async fn version_of(bin: &str, arg: &str) -> Option<String> {
    let output = Command::new(bin).arg(arg).output().await.ok()?;
    output.status.success().then_some(())?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
}

/// Interprets `codex login status`. Verified against Codex CLI 0.142: it
/// prints "Logged in using ChatGPT" to **stderr** and exits 0 when signed
/// in, so both streams are checked, not just stdout.
fn parse_login_status(success: bool, stdout: &str, stderr: &str) -> bool {
    let text = format!("{stdout}\n{stderr}").to_lowercase();
    success && !text.contains("not logged in") && !text.contains("logged out")
}

/// Checks Node, Codex and login state. Never touches the network itself,
/// it only runs local binaries; `codex` owns its own auth (ROADMAP.md M4
/// "Auth rules").
pub async fn diagnose() -> Diagnosis {
    let (node, npx, codex) = tokio::join!(
        version_of("node", "--version"),
        version_of("npx", "--version"),
        version_of(CODEX_BIN, "--version"),
    );

    let logged_in = if codex.is_some() {
        match Command::new(CODEX_BIN)
            .args(["login", "status"])
            .output()
            .await
        {
            Ok(o) => parse_login_status(
                o.status.success(),
                &String::from_utf8_lossy(&o.stdout),
                &String::from_utf8_lossy(&o.stderr),
            ),
            Err(_) => false,
        }
    } else {
        false
    };

    Diagnosis {
        node: node.filter(|_| npx.is_some()),
        codex,
        logged_in,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_in_output_goes_to_stderr_and_still_counts() {
        assert!(parse_login_status(true, "", "Logged in using ChatGPT\n"));
    }

    #[test]
    fn logged_out_is_detected_by_text_or_exit_code() {
        assert!(!parse_login_status(true, "Not logged in", ""));
        assert!(!parse_login_status(true, "", "You are logged out"));
        assert!(!parse_login_status(false, "", ""));
    }
}

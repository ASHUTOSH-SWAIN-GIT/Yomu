//! A macOS/Linux app launched from Finder or a launcher doesn't get the
//! user's shell `PATH`, so `npx` (Node) and `codex` can't be found even
//! though they work in a terminal. On startup we ask the user's login
//! shell for its `PATH` and merge it into ours.

const MARKER: &str = "__YOMU_PATH__";

/// Extracts the PATH printed between markers. The markers matter because
/// interactive shells often print unrelated noise (nvm banners, motd).
fn parse_marked_path(output: &str) -> Option<&str> {
    let start = output.find(MARKER)? + MARKER.len();
    let end = output[start..].find(MARKER)? + start;
    let path = output[start..end].trim();
    (!path.is_empty()).then_some(path)
}

/// Appends any entries from `shell_path` that `current` lacks, keeping the
/// existing order first.
fn merge_paths(current: &str, shell_path: &str) -> String {
    let mut parts: Vec<&str> = current.split(':').filter(|p| !p.is_empty()).collect();
    for entry in shell_path.split(':').filter(|p| !p.is_empty()) {
        if !parts.contains(&entry) {
            parts.push(entry);
        }
    }
    parts.join(":")
}

#[cfg(unix)]
pub fn inherit_shell_path() {
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let (tx, rx) = mpsc::channel();

    // Shell startup files can hang; never block app launch on them.
    std::thread::spawn(move || {
        let output = Command::new(shell)
            .args(["-ilc", &format!("printf '{MARKER}%s{MARKER}' \"$PATH\"")])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = tx.send(output);
    });

    let Ok(Ok(output)) = rx.recv_timeout(Duration::from_secs(3)) else {
        log::warn!("could not read the login shell PATH; keeping the app's own");
        return;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Some(shell_path) = parse_marked_path(&stdout) {
        let current = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", merge_paths(&current, shell_path));
    }
}

#[cfg(not(unix))]
pub fn inherit_shell_path() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_path_between_markers_ignoring_noise() {
        let out = "nvm: loading\n__YOMU_PATH__/a:/b__YOMU_PATH__\nbye";
        assert_eq!(parse_marked_path(out), Some("/a:/b"));
    }

    #[test]
    fn rejects_output_without_markers_or_with_empty_path() {
        assert_eq!(parse_marked_path("just noise"), None);
        assert_eq!(parse_marked_path("__YOMU_PATH____YOMU_PATH__"), None);
    }

    #[test]
    fn merge_keeps_existing_order_and_dedupes() {
        assert_eq!(
            merge_paths("/usr/bin:/bin", "/opt/x:/bin:/usr/bin"),
            "/usr/bin:/bin:/opt/x"
        );
    }
}

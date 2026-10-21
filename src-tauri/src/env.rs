//! A macOS/Linux app launched from Finder or a desktop launcher doesn't get
//! the user's shell `PATH`, so `npx` (Node) and agents such as `opencode`
//! can't be found even though they work in a terminal. On startup we ask the
//! user's shell for its `PATH` and merge it into ours.
//!
//! Both a login shell and an interactive one are asked, because they read
//! different startup files. On bash a login shell reads `/etc/profile` and
//! then the first of `~/.bash_profile`, `~/.bash_login`, `~/.profile` — and
//! never `~/.bashrc`, which is where installers and users almost always put
//! their `PATH` line. Asking only the login shell is why a Linux reader who
//! had an agent working in his terminal saw it as "not found" in Yomu. (zsh,
//! the macOS default, reads `~/.zprofile` *and* `~/.zshrc` for a login shell,
//! which is why this went unnoticed on macOS.)

#[cfg(unix)]
use std::path::Path;

const MARKER: &str = "__YOMU_PATH__";

/// The shells to ask: a login one, for `/etc/profile` and `~/.profile`, and
/// an interactive one, for `~/.bashrc` and its counterparts. Both are merged.
#[cfg(unix)]
const SHELL_INVOCATIONS: [&str; 2] = ["-ilc", "-ic"];

/// How long the shells have, together, to answer before launch moves on.
#[cfg(unix)]
const SHELL_DEADLINE: std::time::Duration = std::time::Duration::from_secs(3);

/// Extracts the PATH printed between markers. The markers matter because
/// interactive shells often print unrelated noise (nvm banners, motd).
fn parse_marked_path(output: &str) -> Option<&str> {
    let start = output.find(MARKER)? + MARKER.len();
    let end = output[start..].find(MARKER)? + start;
    let path = output[start..end].trim();
    (!path.is_empty()).then_some(path)
}

/// The entries of a `PATH`: `:`-separated as usual, and one per line when a
/// shell prints it as a list (fish keeps `PATH` as a list, not a string).
fn entries(path: &str) -> impl Iterator<Item = &str> {
    path.split([':', '\n'])
        .map(str::trim)
        .filter(|p| !p.is_empty())
}

/// Appends any entries from `shell_path` that `current` lacks, keeping the
/// existing order first.
fn merge_paths(current: &str, shell_path: &str) -> String {
    let mut parts: Vec<&str> = entries(current).collect();
    for entry in entries(shell_path) {
        if !parts.contains(&entry) {
            parts.push(entry);
        }
    }
    parts.join(":")
}

/// The user's own shell, when it is really there. `$SHELL` is normally set;
/// the fallbacks are for where it is not. `/bin/zsh` used to be the default,
/// which most Linux systems do not have at all — there the app asked a shell
/// that did not exist and learned nothing.
#[cfg(unix)]
fn login_shell() -> Option<String> {
    std::env::var("SHELL")
        .ok()
        .into_iter()
        .chain(["/bin/bash", "/bin/zsh", "/bin/sh"].map(String::from))
        .find(|shell| Path::new(shell).exists())
}

/// The `PATH` a shell reports, between markers. `$PATH` is printed unquoted
/// so that a shell which keeps it as a list prints one entry per line, and
/// one which keeps it as a string prints the usual `:`-separated line.
#[cfg(unix)]
fn read_path(shell: &str, flags: &str) -> Option<String> {
    use std::process::{Command, Stdio};

    let output = Command::new(shell)
        .args([flags, &format!("printf '{MARKER}%s\n{MARKER}' $PATH")])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_marked_path(&stdout).map(str::to_string)
}

#[cfg(unix)]
pub fn inherit_shell_path() {
    use std::sync::mpsc;
    use std::time::Instant;

    let Some(shell) = login_shell() else {
        log::warn!("no shell to read a PATH from; keeping the app's own");
        return;
    };

    let (tx, rx) = mpsc::channel();
    // Shell startup files can hang; never block app launch on them.
    for flags in SHELL_INVOCATIONS {
        let (shell, tx) = (shell.clone(), tx.clone());
        std::thread::spawn(move || {
            let _ = tx.send(read_path(&shell, flags));
        });
    }
    drop(tx);

    let deadline = Instant::now() + SHELL_DEADLINE;
    let mut shell_path = String::new();
    for _ in SHELL_INVOCATIONS {
        let Some(left) = deadline.checked_duration_since(Instant::now()) else {
            break;
        };
        match rx.recv_timeout(left) {
            Ok(Some(path)) => shell_path = merge_paths(&shell_path, &path),
            Ok(None) => {}
            Err(_) => break,
        }
    }
    if shell_path.is_empty() {
        log::warn!("could not read the login shell PATH; keeping the app's own");
        return;
    }

    let merged = merge_paths(&std::env::var("PATH").unwrap_or_default(), &shell_path);
    log::info!("PATH from {shell} merged in: {merged}");
    std::env::set_var("PATH", merged);
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

    /// fish keeps `PATH` as a list, so asking for it unquoted prints one
    /// entry per line instead of a `:`-separated string.
    #[test]
    fn reads_a_list_style_path_too() {
        assert_eq!(
            merge_paths("/usr/bin", "/opt/x\n/home/me/.opencode/bin\n"),
            "/usr/bin:/opt/x:/home/me/.opencode/bin"
        );
    }

    /// The bug this guards: the fallback used to be `/bin/zsh`, which a
    /// Linux box without zsh does not have, so no PATH was ever learned.
    #[cfg(unix)]
    #[test]
    fn the_shell_it_picks_is_one_that_exists() {
        if let Some(shell) = login_shell() {
            assert!(Path::new(&shell).exists(), "{shell} does not exist");
        }
    }

    /// A login shell and an interactive one read different startup files
    /// (bash: `~/.profile` and `~/.bashrc`), so both are asked.
    #[cfg(unix)]
    #[test]
    fn asks_a_login_shell_and_an_interactive_one() {
        assert!(SHELL_INVOCATIONS.iter().any(|f| f.contains('l')));
        assert!(SHELL_INVOCATIONS.iter().any(|f| !f.contains('l')));
    }
}

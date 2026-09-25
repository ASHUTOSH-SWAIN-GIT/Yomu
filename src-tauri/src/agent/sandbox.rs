//! macOS OS-level confinement for the Codex ACP subprocess (ROADMAP.md M4
//! Safety).
//!
//! Needed because real-world testing (docs/agent-context-plan.md, Track A
//! A0) showed Codex's own declared sandbox policy for `read-only` mode
//! (`sandboxPolicy: { type: "workspaceWrite", writableRoots: [],
//! networkAccess: false }`, sent to the native Codex engine on every turn)
//! is not actually enforced by the current `codex-acp`/Codex combination: a
//! plain shell write and a raw shell command both landed outside the
//! session's working directory with zero denial, zero permission request.
//! So Yomu's own guarantee can't depend on the vendor's -- this wraps the
//! whole subprocess in a real `sandbox-exec` (Seatbelt) profile instead.
//!
//! Reads are left unrestricted: Node/npx need broad read access (their own
//! binaries, npm's cache, dotfiles for config probing) just to function,
//! and locking that down precisely is a much larger, riskier undertaking
//! than confining writes. The residual risk that leaves (a prompt-injected
//! instruction could still *read* something sensitive) is exactly why
//! network is denied by default too -- see `profile`'s `allow_network`.

use std::path::Path;

/// Builds a Seatbelt profile (fed to `sandbox-exec -p`) that:
/// - allows the process to run at all (exec, fork, standard OS plumbing);
/// - allows unrestricted reads;
/// - denies writes everywhere -- including the session's cwd, since Yomu
///   only reads/explains and never needs the agent to write files -- except
///   the user's npm cache (`npx` needs to write there to fetch/cache the
///   adapter package) and Codex's own `~/.codex` state dir (its
///   session/auth sqlite db -- confirmed necessary: without it Codex fails
///   outright with "failed to initialize sqlite state runtime", not a
///   security-relevant write target, same category as the npm cache);
/// - allows outbound network only if `allow_network` is true.
pub fn profile(allow_network: bool) -> String {
    let mut writable = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        writable.push(escape(&Path::new(&home).join(".npm").to_string_lossy()));
        writable.push(escape(&Path::new(&home).join(".codex").to_string_lossy()));
    }
    let write_rules: String = writable
        .iter()
        .map(|p| format!("(allow file-write* (subpath \"{p}\"))\n"))
        .collect();
    let network_rule = if allow_network {
        "(allow network*)\n"
    } else {
        ""
    };

    format!(
        "(version 1)\n\
         (deny default)\n\
         (allow process-fork)\n\
         (allow process-exec)\n\
         (allow signal)\n\
         (allow sysctl-read)\n\
         (allow mach-lookup)\n\
         (allow system-socket)\n\
         (allow file-read*)\n\
         (allow file-write-data (literal \"/dev/null\"))\n\
         (allow file-write-data (literal \"/dev/tty\"))\n\
         (allow file-ioctl (literal \"/dev/tty\"))\n\
         {write_rules}\
         {network_rule}"
    )
}

/// Escapes a path for embedding in a Seatbelt profile string literal.
fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confines_writes_to_npm_and_codex_dirs_only() {
        let p = profile(true);
        assert!(p.contains("(deny default)"));
        assert!(!p.contains("yomu-agent-sessions"));
        assert!(p.contains("/.npm\""));
        assert!(p.contains("/.codex\""));
        assert!(p.contains("(allow network*)"));
    }

    #[test]
    fn denies_network_when_not_allowed() {
        let p = profile(false);
        assert!(!p.contains("network"));
    }

}

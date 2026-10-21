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
//! Reads: everything outside the user's home folder stays readable (system
//! libraries, Node, `/tmp`), but the home folder itself is locked down --
//! Documents, Desktop, `~/.ssh`, browser data and the rest -- except the few
//! places Node/npx and Codex need to run (`~/.npm`, `~/.codex`, `~/.npmrc`,
//! and the Node install if it lives in home, e.g. nvm). Without this a
//! prompt-injected article could make the agent read personal files and
//! send them out over the (necessarily open) network. Verified against real
//! Codex: it starts, streams and browses with this profile.

use std::path::{Path, PathBuf};

/// Builds a Seatbelt profile (fed to `sandbox-exec -p`) for an agent that:
/// - allows the process to run at all (exec, fork, standard OS plumbing);
/// - allows reads outside the home folder, and inside it only the places
///   Node/Codex need (see the module docs);
/// - denies writes everywhere -- Yomu only reads/explains, never needs the
///   agent to write to the reader's files -- except the user's npm cache
///   (`npx` needs to write there to fetch/cache the adapter package), Codex's
///   own `~/.codex` state dir (its session/auth sqlite db -- confirmed
///   necessary: without it Codex fails outright with "failed to initialize
///   sqlite state runtime", not a security-relevant write target, same
///   category as the npm cache), and the `extra_write` folders below;
/// - allows outbound network (Codex can't run without it).
///
/// `extra_read` are folders the agent may read (its own program);
/// `extra_write` folders it may also write (its own state, such as a
/// sign-in, and the private scratch folder it is handed so it can boot).
pub fn profile_with(extra_read: &[PathBuf], extra_write: &[PathBuf]) -> String {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let path = std::env::var("PATH").unwrap_or_default();
    let mut roots = node_roots(home.as_deref(), &path);
    roots.extend_from_slice(extra_read);
    build(home.as_deref(), &roots, extra_write)
}

/// The Node installs on `PATH` that live inside `home` (e.g. nvm's
/// `~/.nvm/versions/node/vX`): the parent of each `bin` dir holding `node`
/// or `npx`. Installs outside home (Homebrew, system) are already readable.
fn node_roots(home: Option<&Path>, path: &str) -> Vec<PathBuf> {
    let Some(home) = home else { return Vec::new() };
    std::env::split_paths(path)
        .filter(|dir| dir.starts_with(home))
        .filter(|dir| dir.join("node").exists() || dir.join("npx").exists())
        .filter_map(|dir| dir.parent().map(Path::to_path_buf))
        .collect()
}

fn build(home: Option<&Path>, node_roots: &[PathBuf], extra_write: &[PathBuf]) -> String {
    let mut writable = Vec::new();
    let mut read_lock = String::new();
    if let Some(home) = home.map(real) {
        let sub = |name: &str| escape(&home.join(name).to_string_lossy());
        writable.push(sub(".npm"));
        writable.push(sub(".codex"));

        read_lock.push_str(&format!(
            "(deny file-read-data (subpath \"{}\"))\n",
            escape(&home.to_string_lossy())
        ));
        for name in [".npm", ".codex"] {
            read_lock.push_str(&format!(
                "(allow file-read-data (subpath \"{}\"))\n",
                sub(name)
            ));
        }
        read_lock.push_str(&format!(
            "(allow file-read-data (literal \"{}\"))\n",
            sub(".npmrc")
        ));
        for root in node_roots.iter().chain(extra_write) {
            read_lock.push_str(&format!(
                "(allow file-read-data (subpath \"{}\"))\n",
                escape(&real(root).to_string_lossy())
            ));
        }
        for dir in extra_write {
            writable.push(escape(&real(dir).to_string_lossy()));
        }
    }
    read_lock.push_str("(deny file-read-data (subpath \"/Volumes\"))\n");
    let write_rules: String = writable
        .iter()
        .map(|p| format!("(allow file-write* (subpath \"{p}\"))\n"))
        .collect();

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
         {read_lock}\
         (allow file-write-data (literal \"/dev/null\"))\n\
         (allow file-write-data (literal \"/dev/tty\"))\n\
         (allow file-ioctl (literal \"/dev/tty\"))\n\
         {write_rules}\
         (allow network*)\n"
    )
}

/// Escapes a path for embedding in a Seatbelt profile string literal.
fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// `path` as the filesystem really sees it. Seatbelt matches its rules
/// against real paths, so a rule written with a symlinked path — macOS's
/// `/tmp` → `/private/tmp`, or `$TMPDIR` under `/var/folders` — never matches
/// and every write there is denied. A path that does not exist yet is
/// returned unchanged.
fn real(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn built() -> String {
        build(
            Some(Path::new("/Users/me")),
            &[PathBuf::from("/Users/me/.nvm/v24")],
            &[],
        )
    }

    #[test]
    fn confines_writes_to_npm_and_codex_dirs_only() {
        let p = built();
        assert!(p.contains("(deny default)"));
        assert!(p.contains("(allow file-write* (subpath \"/Users/me/.npm\"))"));
        assert!(p.contains("(allow file-write* (subpath \"/Users/me/.codex\"))"));
        assert!(!p.contains("file-write* (subpath \"/Users/me\")"));
        assert!(p.contains("(allow network*)"));
    }

    #[test]
    fn locks_home_reads_except_what_node_and_codex_need() {
        let p = built();
        let deny = p
            .find("(deny file-read-data (subpath \"/Users/me\"))")
            .unwrap();
        let allow_npm = p
            .find("(allow file-read-data (subpath \"/Users/me/.npm\"))")
            .unwrap();
        let allow_node = p
            .find("(allow file-read-data (subpath \"/Users/me/.nvm/v24\"))")
            .unwrap();
        assert!(
            deny < allow_npm && deny < allow_node,
            "exceptions must come after the deny"
        );
        assert!(p.contains("(allow file-read-data (subpath \"/Users/me/.codex\"))"));
        assert!(p.contains("(allow file-read-data (literal \"/Users/me/.npmrc\"))"));
        assert!(p.contains("(deny file-read-data (subpath \"/Volumes\"))"));
    }

    #[test]
    fn a_custom_agent_gets_its_own_folders_and_nothing_more() {
        let p = build(
            Some(Path::new("/Users/me")),
            &[PathBuf::from("/Users/me/bin")],
            &[PathBuf::from("/Users/me/.myagent")],
        );
        assert!(p.contains("(allow file-write* (subpath \"/Users/me/.myagent\"))"));
        assert!(p.contains("(allow file-read-data (subpath \"/Users/me/.myagent\"))"));
        assert!(p.contains("(allow file-read-data (subpath \"/Users/me/bin\"))"));
        // The program's folder is readable, not writable.
        assert!(!p.contains("file-write* (subpath \"/Users/me/bin\")"));
        assert!(!p.contains("file-write* (subpath \"/Users/me\")"));
    }

    #[test]
    fn finds_only_node_installs_inside_home() {
        let tmp = std::env::temp_dir().join("yomu-node-roots-test");
        let bin = tmp.join("home/.nvm/v1/bin");
        let other = tmp.join("home/.local/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(bin.join("node"), "").unwrap();
        let path = format!("{}:{}:/usr/bin", bin.display(), other.display());
        let roots = node_roots(Some(&tmp.join("home")), &path);
        assert_eq!(roots, vec![tmp.join("home/.nvm/v1")]);
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Real processes under a real profile: what the rules say is what
    /// happens. (macOS only, like the module.)
    struct Fixture {
        dir: PathBuf,
        home: PathBuf,
        profile: String,
    }

    fn fixture(name: &str) -> Fixture {
        // Seatbelt matches real paths, and the temp folder is behind a link.
        let dir = std::fs::canonicalize(std::env::temp_dir())
            .unwrap()
            .join(format!("yomu-sandbox-{name}-{}", std::process::id()));
        let home = dir.join("home");
        std::fs::create_dir_all(home.join(".npm")).unwrap();
        std::fs::create_dir_all(home.join("Documents")).unwrap();
        std::fs::write(home.join("Documents/secret.txt"), "the-secret-words").unwrap();
        std::fs::write(home.join(".npm/cached.txt"), "package").unwrap();
        let profile = build(Some(&home), &[], &[]);
        Fixture { dir, home, profile }
    }

    /// Runs `script` in `sh` under the profile: whether it succeeded, and
    /// what it printed.
    fn run(profile: &str, script: &str) -> (bool, String) {
        let out = std::process::Command::new("sandbox-exec")
            .args(["-p", profile, "--", "sh", "-c", script])
            .current_dir(std::env::temp_dir())
            .output()
            .unwrap();
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        (out.status.success(), text)
    }

    #[test]
    fn the_agent_still_runs_and_reads_the_system() {
        let f = fixture("system");
        let (ok, out) = run(&f.profile, "cat /etc/hosts > /dev/null && echo fine");
        assert!(ok && out.contains("fine"), "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn personal_files_in_home_cannot_be_read() {
        let f = fixture("reads");
        let secret = f.home.join("Documents/secret.txt");
        let (ok, out) = run(&f.profile, &format!("cat '{}'", secret.display()));
        assert!(
            !ok && !out.contains("the-secret-words"),
            "the secret was readable: {out}"
        );
        let cached = f.home.join(".npm/cached.txt");
        let (ok, out) = run(&f.profile, &format!("cat '{}'", cached.display()));
        assert!(ok && out.contains("package"), "{out}");
        let (ok, _) = run(&f.profile, &format!("ls '{}/Documents'", f.home.display()));
        assert!(!ok);
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn writes_are_denied_except_the_npm_cache_and_dev_null() {
        let f = fixture("writes");
        let (ok, out) = run(
            &f.profile,
            &format!("echo x > '{}/.npm/new.txt'", f.home.display()),
        );
        assert!(ok, "the npm cache must be writable: {out}");

        let outside = f.dir.join("outside.txt");
        let docs = f.home.join("Documents/new.txt");
        for target in [outside.as_path(), docs.as_path(), Path::new("/tmp/yomu-x")] {
            let (ok, _) = run(&f.profile, &format!("echo x > '{}'", target.display()));
            assert!(!ok, "wrote to {}", target.display());
            assert!(!target.exists());
        }
        let doc = f.home.join("Documents/secret.txt");
        let (ok, _) = run(&f.profile, &format!("rm '{}'", doc.display()));
        assert!(!ok && doc.exists());

        let (ok, out) = run(&f.profile, "echo discarded > /dev/null");
        assert!(ok, "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn what_the_agent_starts_is_confined_too() {
        let f = fixture("children");
        let secret = f.home.join("Documents/secret.txt");
        let (ok, out) = run(
            &f.profile,
            &format!("sh -c 'sh -c \"cat {}\"'", secret.display()),
        );
        assert!(!ok && !out.contains("the-secret-words"), "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn the_scratch_folder_is_writable_so_an_agent_can_boot() {
        let f = fixture("scratch");
        let scratch = f.dir.join("scratch");
        std::fs::create_dir_all(&scratch).unwrap();
        let profile = build(Some(&f.home), &[], std::slice::from_ref(&scratch));
        // What OpenCode's Bun runtime does on start-up: make a folder under
        // `$TMPDIR`. Denying it is what made OpenCode fail with EPERM.
        let (ok, out) = run(
            &profile,
            &format!(
                "export TMPDIR='{}'; mkdir -p \"$TMPDIR/opencode\" && echo made",
                scratch.display()
            ),
        );
        assert!(
            ok && out.contains("made"),
            "scratch must be writable: {out}"
        );
        assert!(scratch.join("opencode").is_dir());
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn a_symlinked_scratch_folder_is_matched_by_its_real_path() {
        // macOS's `/tmp` is a link to `/private/tmp`, and `$TMPDIR` sits
        // under a linked `/var`; Seatbelt only matches real paths, so
        // `build` has to resolve a folder before writing its rule.
        let f = fixture("symlink");
        let real_dir = f.dir.join("real-scratch");
        std::fs::create_dir_all(&real_dir).unwrap();
        let link = f.dir.join("linked-scratch");
        std::os::unix::fs::symlink(&real_dir, &link).unwrap();
        let profile = build(Some(&f.home), &[], std::slice::from_ref(&link));
        let (ok, out) = run(&profile, &format!("mkdir -p '{}/opencode'", link.display()));
        assert!(ok, "a linked folder must still be writable: {out}");
        assert!(real_dir.join("opencode").is_dir());
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn escapes_quotes_and_backslashes_in_paths() {
        let p = build(Some(Path::new(r#"/Users/we"ird"#)), &[], &[]);
        assert!(p.contains(r#"we\"ird"#));
    }
}

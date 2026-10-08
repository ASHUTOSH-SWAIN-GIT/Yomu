//! Linux confinement for the agent subprocess: the counterpart of
//! `sandbox.rs` (macOS), with the same rules.
//!
//! - Reads: everything outside the home folder stays readable (system
//!   libraries, Node, `/tmp`), but the home folder is locked down except the
//!   few places Node/npx and the agent need (`~/.npm`, `~/.codex`, `~/.npmrc`,
//!   a Node install inside home such as nvm, and a custom agent's own
//!   folders). Without this, a prompt-injected article could make the agent
//!   read personal files and send them out over the (necessarily open)
//!   network.
//! - Writes: denied everywhere except the npm cache, `~/.codex`, a custom
//!   agent's own data folders, and `/dev/null` and `/dev/tty`.
//! - Network: allowed (the agent cannot run without it).
//!
//! It uses Landlock, which the kernel enforces on the process and everything
//! it starts, and which needs no privileges. The rules are fixed in the
//! parent and applied in the child just before the agent is executed.
//! Landlock needs Linux 5.13 or newer; on an older kernel the agent runs
//! unconfined and [`available`] says so, so the settings can tell the user.
//!
//! The policy itself ([`Policy`], [`policy`]) is plain data, so it is tested
//! on every system; only applying it is Linux-only.

use std::path::{Path, PathBuf};

/// What the agent may touch.
#[derive(Debug, Default, PartialEq)]
pub struct Policy {
    /// Folders and files it may read and run.
    pub read: Vec<PathBuf>,
    /// Folders it may read, run, write and create in.
    pub write: Vec<PathBuf>,
    /// Single files it may read and write.
    pub write_files: Vec<PathBuf>,
}

/// The Node installs on `PATH` that live inside `home` (e.g. nvm's
/// `~/.nvm/versions/node/vX`): the parent of each `bin` dir holding `node`
/// or `npx`. Installs outside home (system packages) are already readable.
pub fn node_roots(home: Option<&Path>, path: &str) -> Vec<PathBuf> {
    let Some(home) = home else { return Vec::new() };
    std::env::split_paths(path)
        .filter(|dir| dir.starts_with(home))
        .filter(|dir| dir.join("node").exists() || dir.join("npx").exists())
        .filter_map(|dir| dir.parent().map(Path::to_path_buf))
        .collect()
}

/// The rules for an agent. `root_entries` are the entries directly under `/`
/// (passed in so this stays testable). `extra_read` are folders a custom
/// agent may read (its own program), `extra_write` folders it may also write
/// (its own state, such as a sign-in); both only matter inside home.
pub fn policy(
    home: Option<&Path>,
    node_roots: &[PathBuf],
    root_entries: &[PathBuf],
    extra_read: &[PathBuf],
    extra_write: &[PathBuf],
) -> Policy {
    let mut read = Vec::new();
    for entry in root_entries {
        // Removable and mounted drives are as private as home.
        if entry == Path::new("/mnt") || entry == Path::new("/media") {
            continue;
        }
        // The top-level folder holding home (`/home`, `/root`) stays shut.
        if home.is_some_and(|h| h.starts_with(entry)) {
            continue;
        }
        read.push(entry.clone());
    }
    let mut write = Vec::new();
    if let Some(home) = home {
        for name in [".npm", ".codex"] {
            read.push(home.join(name));
            write.push(home.join(name));
        }
        read.push(home.join(".npmrc"));
        read.extend(node_roots.iter().cloned());
        read.extend(extra_read.iter().cloned());
        for dir in extra_write {
            read.push(dir.clone());
            write.push(dir.clone());
        }
    }
    Policy {
        read,
        write,
        write_files: vec![PathBuf::from("/dev/null"), PathBuf::from("/dev/tty")],
    }
}

/// The policy for this machine and user, for an agent with these extra
/// folders.
pub fn policy_for_this_machine(extra_read: &[PathBuf], extra_write: &[PathBuf]) -> Policy {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let path = std::env::var("PATH").unwrap_or_default();
    policy_for(home.as_deref(), &path, extra_read, extra_write)
}

/// [`policy_for_this_machine`] for a given home folder and `PATH`.
fn policy_for(
    home: Option<&Path>,
    path: &str,
    extra_read: &[PathBuf],
    extra_write: &[PathBuf],
) -> Policy {
    let roots = node_roots(home, path);
    let entries: Vec<PathBuf> = std::fs::read_dir("/")
        .map(|d| d.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    policy(home, &roots, &entries, extra_read, extra_write)
}

#[cfg(target_os = "linux")]
mod landlock_impl {
    use std::os::unix::process::CommandExt;

    use landlock::{
        Access, AccessFs, CompatLevel, Compatible, PathBeneath, PathFd, Ruleset, RulesetAttr,
        RulesetCreated, RulesetCreatedAttr, ABI,
    };

    use super::Policy;

    /// What the process is allowed to do with each kind of path.
    const ABI_USED: ABI = ABI::V3;

    /// True when this kernel can enforce Landlock rules.
    pub fn available() -> bool {
        Ruleset::default()
            .set_compatibility(CompatLevel::HardRequirement)
            .handle_access(AccessFs::from_all(ABI::V1))
            .and_then(|ruleset| ruleset.create())
            .is_ok()
    }

    fn build(policy: &Policy) -> Result<RulesetCreated, String> {
        let all = AccessFs::from_all(ABI_USED);
        let read = AccessFs::from_read(ABI_USED);
        let file = AccessFs::ReadFile | AccessFs::WriteFile;
        let err = |e: landlock::RulesetError| format!("could not set up the sandbox: {e}");

        let mut ruleset = Ruleset::default()
            // Everything Landlock can control is denied unless a rule below
            // allows it.
            .handle_access(all)
            .map_err(err)?
            .create()
            .map_err(err)?;
        let groups = [
            (&policy.read, read),
            (&policy.write, all),
            (&policy.write_files, file),
        ];
        for (paths, access) in groups {
            for path in paths {
                // A folder that does not exist (no `~/.codex` yet) has
                // nothing to allow.
                let Ok(fd) = PathFd::new(path) else { continue };
                ruleset = ruleset
                    .add_rule(PathBeneath::new(fd, access))
                    .map_err(err)?;
            }
        }
        Ok(ruleset)
    }

    /// Makes `command` start inside the policy. Fails (so the caller can
    /// decide) if the rules cannot be built; once built, a failure to
    /// enforce them makes the agent fail to start rather than run unconfined.
    pub fn confine(command: &mut std::process::Command, policy: &Policy) -> Result<(), String> {
        let ruleset = build(policy)?;
        let mut pending = Some(ruleset);
        // SAFETY: the closure only makes system calls (landlock_restrict_self
        // and prctl) on a ruleset built before the fork.
        unsafe {
            command.pre_exec(move || {
                let ruleset = pending
                    .take()
                    .ok_or_else(|| std::io::Error::other("sandbox already used"))?;
                ruleset
                    .restrict_self()
                    .map(|_| ())
                    .map_err(|e| std::io::Error::other(e.to_string()))
            });
        }
        Ok(())
    }
}

#[cfg(target_os = "linux")]
pub use landlock_impl::{available, confine};

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    fn root() -> Vec<PathBuf> {
        [
            "/usr", "/etc", "/home", "/tmp", "/mnt", "/media", "/dev", "/proc",
        ]
        .iter()
        .map(|s| p(s))
        .collect()
    }

    fn built() -> Policy {
        policy(
            Some(Path::new("/home/me")),
            &[p("/home/me/.nvm/v24")],
            &root(),
            &[],
            &[],
        )
    }

    #[test]
    fn reads_the_system_but_not_the_folder_holding_home_or_other_drives() {
        let policy = built();
        for ok in ["/usr", "/etc", "/tmp", "/dev", "/proc"] {
            assert!(policy.read.contains(&p(ok)), "{ok} should be readable");
        }
        for shut in ["/home", "/mnt", "/media"] {
            assert!(!policy.read.contains(&p(shut)), "{shut} should be shut");
        }
    }

    #[test]
    fn opens_home_only_for_what_node_and_the_agent_need() {
        let policy = built();
        for ok in [
            "/home/me/.npm",
            "/home/me/.codex",
            "/home/me/.npmrc",
            "/home/me/.nvm/v24",
        ] {
            assert!(policy.read.contains(&p(ok)), "{ok} should be readable");
        }
        assert!(!policy.read.contains(&p("/home/me")));
    }

    #[test]
    fn writes_only_to_the_npm_cache_and_agent_state() {
        let policy = built();
        assert_eq!(policy.write, vec![p("/home/me/.npm"), p("/home/me/.codex")]);
        assert_eq!(policy.write_files, vec![p("/dev/null"), p("/dev/tty")]);
    }

    #[test]
    fn a_custom_agent_gets_its_own_folders_and_nothing_more() {
        let policy = policy(
            Some(Path::new("/home/me")),
            &[],
            &root(),
            &[p("/home/me/bin")],
            &[p("/home/me/.myagent")],
        );
        assert!(policy.write.contains(&p("/home/me/.myagent")));
        assert!(policy.read.contains(&p("/home/me/.myagent")));
        assert!(policy.read.contains(&p("/home/me/bin")));
        // The program's folder is readable, not writable.
        assert!(!policy.write.contains(&p("/home/me/bin")));
        assert!(!policy.write.contains(&p("/home/me")));
    }

    #[test]
    fn without_a_home_folder_nothing_extra_is_opened() {
        let policy = policy(None, &[], &root(), &[p("/x")], &[p("/y")]);
        assert!(!policy.read.contains(&p("/x")));
        assert!(policy.write.is_empty());
    }

    #[test]
    fn finds_only_node_installs_inside_home() {
        let tmp = std::env::temp_dir().join("yomu-confine-node-roots-test");
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
}

/// Runs real processes under the policy. They need a kernel with Landlock, so
/// they say so and pass when there is none.
#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use super::*;

    struct Fixture {
        dir: PathBuf,
        home: PathBuf,
        policy: Policy,
    }

    fn fixture(name: &str) -> Fixture {
        let dir = std::env::temp_dir().join(format!("yomu-confine-{name}-{}", std::process::id()));
        let home = dir.join("home");
        std::fs::create_dir_all(home.join(".npm")).unwrap();
        std::fs::create_dir_all(home.join("Documents")).unwrap();
        std::fs::write(home.join("Documents/secret.txt"), "the-secret-words").unwrap();
        std::fs::write(home.join(".npm/cached.txt"), "package").unwrap();
        std::fs::write(home.join(".npmrc"), "registry").unwrap();
        let entries: Vec<PathBuf> = std::fs::read_dir("/")
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        let policy = policy(Some(&home), &[], &entries, &[], &[]);
        Fixture { dir, home, policy }
    }

    /// Runs `script` in `sh` under the policy: whether it succeeded, and
    /// what it printed.
    fn run(policy: &Policy, script: &str) -> (bool, String) {
        let mut command = std::process::Command::new("sh");
        command.arg("-c").arg(script);
        confine(&mut command, policy).unwrap();
        let out = command.output().unwrap();
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        (out.status.success(), text)
    }

    /// Where the sandbox is supposed to work (CI sets this), a kernel
    /// without Landlock is a failure, not a reason to pass without testing.
    fn supported() -> bool {
        let yes = available();
        if !yes {
            assert!(
                std::env::var_os("YOMU_REQUIRE_LANDLOCK").is_none(),
                "YOMU_REQUIRE_LANDLOCK is set but this kernel has no Landlock"
            );
            eprintln!("SKIPPED: this kernel has no Landlock");
        }
        yes
    }

    #[test]
    fn the_agent_still_runs_and_reads_the_system() {
        if !supported() {
            return;
        }
        let f = fixture("system");
        let (ok, out) = run(&f.policy, "cat /etc/passwd > /dev/null && echo fine");
        assert!(ok, "{out}");
        assert!(out.contains("fine"));
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    /// The control: the very same commands succeed without the sandbox, so
    /// the denials in the other tests come from it and from nothing else (not
    /// a missing file, not the user the tests run as).
    #[test]
    fn the_same_commands_work_without_the_sandbox() {
        let f = fixture("control");
        let secret = f.home.join("Documents/secret.txt");
        let outside = std::env::temp_dir().join(format!("yomu-control-{}", std::process::id()));
        let out = std::process::Command::new("sh")
            .arg("-c")
            .arg(format!(
                "cat {} && echo x > {}",
                secret.display(),
                outside.display()
            ))
            .output()
            .unwrap();
        assert!(out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("the-secret-words"));
        assert!(outside.exists());
        std::fs::remove_file(&outside).unwrap();
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn personal_files_in_home_cannot_be_read() {
        if !supported() {
            return;
        }
        let f = fixture("reads");
        let secret = f.home.join("Documents/secret.txt");
        let (ok, out) = run(&f.policy, &format!("cat {}", secret.display()));
        assert!(!ok, "the secret was readable: {out}");
        assert!(!out.contains("the-secret-words"));
        // What the agent needs in home is still there.
        let cached = f.home.join(".npm/cached.txt");
        let (ok, out) = run(&f.policy, &format!("cat {}", cached.display()));
        assert!(ok && out.contains("package"), "{out}");
        let npmrc = f.home.join(".npmrc");
        let (ok, _) = run(&f.policy, &format!("cat {}", npmrc.display()));
        assert!(ok);
        // Listing home is no way round it.
        let (ok, _) = run(&f.policy, &format!("ls {}/Documents", f.home.display()));
        assert!(!ok);
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn writes_are_denied_except_the_npm_cache_and_dev_null() {
        if !supported() {
            return;
        }
        let f = fixture("writes");
        let (ok, out) = run(
            &f.policy,
            &format!("echo x > {}/.npm/new.txt", f.home.display()),
        );
        assert!(ok, "the npm cache must be writable: {out}");

        let outside = std::env::temp_dir().join(format!("yomu-outside-{}", std::process::id()));
        let docs = f.home.join("Documents/new.txt");
        for target in [
            outside.as_path(),
            docs.as_path(),
            Path::new("/var/tmp/yomu-x"),
        ] {
            let (ok, _) = run(&f.policy, &format!("echo x > {}", target.display()));
            assert!(!ok, "wrote to {}", target.display());
            assert!(!target.exists());
        }
        // Deleting and renaming are writes too.
        let cached = f.home.join(".npm/cached.txt");
        let doc = f.home.join("Documents/secret.txt");
        let (ok, _) = run(&f.policy, &format!("rm {}", doc.display()));
        assert!(!ok);
        assert!(doc.exists());
        let (ok, _) = run(&f.policy, &format!("rm {}", cached.display()));
        assert!(ok, "the npm cache may be tidied");

        let (ok, out) = run(&f.policy, "echo discarded > /dev/null");
        assert!(ok, "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    /// Where `program` is on `PATH`, if it is.
    fn find_on_path(program: &str) -> Option<PathBuf> {
        let path = std::env::var("PATH").ok()?;
        std::env::split_paths(&path)
            .map(|dir| dir.join(program))
            .find(|p| p.is_file())
    }

    /// The agent is a Node program, so the real thing: Node starts under the
    /// policy and does its job, and still cannot touch what is shut.
    #[test]
    fn real_node_runs_inside_the_sandbox_and_cannot_reach_personal_files() {
        if !supported() {
            return;
        }
        // A Node kept inside the real home folder would be shut off from the
        // fixture's home; that is the normal case on a developer's machine.
        let real_home = std::env::var_os("HOME").map(PathBuf::from);
        match (find_on_path("node"), real_home) {
            (None, _) => return eprintln!("SKIPPED: no node on PATH"),
            (Some(node), Some(ref home)) if node.starts_with(home) => {
                return eprintln!("SKIPPED: node lives inside the home folder")
            }
            _ => {}
        }
        let f = fixture("node");
        let path = std::env::var("PATH").unwrap_or_default();
        let policy = policy_for(Some(&f.home), &path, &[], &[]);
        let node = |script: &str| -> (bool, String) {
            let mut command = std::process::Command::new("node");
            command.arg("-e").arg(script).current_dir("/");
            confine(&mut command, &policy).unwrap();
            let out = command.output().unwrap();
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            (out.status.success(), text)
        };
        let js = |s: &Path| format!("{:?}", s.to_string_lossy());

        let (ok, out) = node("console.log(process.platform)");
        assert!(ok && out.contains("linux"), "{out}");
        // The npm cache is the one place it may write in home.
        let cache = f.home.join(".npm/from-node.txt");
        let (ok, out) = node(&format!("require('fs').writeFileSync({}, 'x')", js(&cache)));
        assert!(ok && cache.exists(), "{out}");
        // Everything else in home stays shut, to Node and to what Node starts.
        let secret = f.home.join("Documents/secret.txt");
        let (ok, out) = node(&format!("require('fs').readFileSync({})", js(&secret)));
        assert!(!ok && !out.contains("the-secret-words"), "{out}");
        let (ok, _) = node(&format!(
            "require('child_process').execSync('cat ' + {})",
            js(&secret)
        ));
        assert!(!ok);
        let elsewhere = f.home.join("Documents/new.txt");
        let (ok, _) = node(&format!(
            "require('fs').writeFileSync({}, 'x')",
            js(&elsewhere)
        ));
        assert!(!ok && !elsewhere.exists());
        // The network stays open: the agent cannot work without it.
        let (ok, out) = node(
            "const s = require('net').createServer().listen(0, '127.0.0.1', () => { console.log('listening'); s.close(); })",
        );
        assert!(ok && out.contains("listening"), "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }

    #[test]
    fn what_the_agent_starts_is_confined_too() {
        if !supported() {
            return;
        }
        let f = fixture("children");
        let secret = f.home.join("Documents/secret.txt");
        let (ok, out) = run(
            &f.policy,
            &format!("sh -c 'sh -c \"cat {}\"'", secret.display()),
        );
        assert!(!ok && !out.contains("the-secret-words"), "{out}");
        std::fs::remove_dir_all(&f.dir).unwrap();
    }
}

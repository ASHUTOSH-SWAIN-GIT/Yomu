# Windows sandbox for the agent: design (not built yet)

**Status:** not implemented. On Windows the agent runs without the sandbox the
Mac and Linux builds have. Nothing here has been run, because there was no
Windows machine to test on. This is the plan, so it can be built and verified
on one.

## What it must do (the same rules as macOS and Linux)

- **Reads:** everything outside the user's profile stays readable (system
  files, the Node install). Inside the profile, only what Node and the agent
  need: the npm cache (`%APPDATA%\npm-cache`, `%LOCALAPPDATA%\npm-cache`),
  `~/.codex`, `.npmrc`, a Node install inside the profile (nvm-windows), and a
  custom agent's own folders.
- **Writes:** denied everywhere except the npm cache, `~/.codex`, a custom
  agent's own data folders, and `NUL`.
- **Network:** allowed (the agent cannot run without it).
- It must apply to everything the agent starts.

The Linux version is `src-tauri/src/agent/confine.rs` (Landlock); the policy
there (`Policy`, `policy()`) is plain data and can be reused as is.

## Options considered

| Option                         | Confines reads                                          | Confines writes                  | Network control  | Verdict                                                                                          |
| ------------------------------ | ------------------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| **AppContainer**               | Yes (files not granted to the container are unreadable) | Yes                              | Yes (capability) | **Chosen.** The Windows equivalent of what we do elsewhere.                                      |
| Low-integrity restricted token | No                                                      | Yes (to low-integrity locations) | No               | Stops writes only, so a prompt-injected agent could still read personal files. Not enough alone. |
| Job object                     | No                                                      | No                               | No               | Limits resources only. Useful as an extra (kill the whole tree on exit).                         |
| WSL2 + the Linux sandbox       | Yes                                                     | Yes                              | n/a              | Needs the user to have WSL. A fallback for those who do, not the default.                        |

## How to build it (AppContainer)

1. **Container.** Create a profile once with `CreateAppContainerProfile` (name
   `yomu-agent`) and keep its SID. Give it the `internetClient` capability so
   network works.
2. **Grant access.** AppContainers can read system locations already
   (`ALL APPLICATION PACKAGES` has read there). For each folder in the
   `Policy` that lives in the profile (npm cache, `~/.codex`, a Node install,
   a custom agent's folders), add an ACL entry for the container's SID: read
   and execute for read folders, modify for write folders. Do it before each
   start, and never on the profile folder itself.
3. **Start the process.** Use `CreateProcessW` with
   `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` (the container SID plus the
   capability), and with pipes for stdin, stdout and stderr. Put the process in
   a job object with `KILL_ON_JOB_CLOSE`, so quitting Yomu ends the agent and
   everything it started.
4. **Working directory.** Use a folder the container may read (the same reason
   the other platforms use the temp folder).
5. **Fit it into the harness.** `RpcClient` (`agent/rpc.rs`) is built on
   `tokio::process::Child`. `CreateProcessW` does not give one, so first put the
   handful of things the client uses (write stdin, read stdout and stderr,
   `kill`, `has_exited`) behind a small trait, with the current `tokio` child as
   one implementation and the AppContainer process as the other.
6. **Detection.** `available()` on Windows is true when the profile can be
   created and the first start works. If not, run unconfined and say so in
   Settings, as on Linux kernels without Landlock.

## Things that will bite

- **Where Node lives.** `nvm-windows` and `scoop` install under the profile, so
  they need the grant in step 2. A system-wide Node (Program Files) needs none.
- **`npx` writes.** `npx` caches the adapter in the npm cache, which is why that
  folder is writable on every platform.
- **Antivirus.** Some products flag unusual process creation. Test with
  Defender on.
- **ACL leftovers.** Entries added for the container should be removed when the
  agent folder is no longer used (a custom agent was removed).

## How to verify

1. Add a `windows-latest` job to `.github/workflows/ci.yml` that builds and
   runs the same tests the Linux confinement has (read home file: denied; write
   outside the allowed folders: denied; write to the npm cache: allowed; a
   child process is confined too).
2. On a real Windows machine, run `cargo test real_codex -- --ignored` to prove
   the real Codex starts, streams and browses inside the container.
3. Check the mock-agent tests pass unchanged (they exercise the harness, not
   the sandbox).

## Effort

L: about a week, most of it the `CreateProcessW` plumbing and testing on real
Windows machines, not the policy.

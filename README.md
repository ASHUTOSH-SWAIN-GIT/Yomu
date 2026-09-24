# Yomu

An agent native desktop reader for technical blogs and docs.

- Paste a link, read it in a clean reader view
- Select any passage and have your local Codex agent explain it
- Uses your ChatGPT subscription via Codex CLI, no API keys
- Everything runs locally: Tauri 2, React, SQLite, ACP

See [ROADMAP.md](./ROADMAP.md) for the build plan and [docs/decisions](./docs/decisions) for design decisions.

## Requirements

| Tool                | Why                                                          |
| ------------------- | ------------------------------------------------------------ |
| Node.js 22+         | Frontend build, and runs the Codex ACP adapter through `npx` |
| Rust (stable)       | Tauri core. Install with [rustup](https://rustup.rs)         |
| Codex CLI           | The agent. Needs a paid ChatGPT plan                         |
| Tauri prerequisites | https://tauri.app/start/prerequisites/                       |

## Codex setup

1. Install the Codex CLI (see OpenAI's Codex CLI docs) and check `codex --version` works.
2. Sign in: `codex login` (or use the **Sign in with ChatGPT** button in Yomu's Explain panel).
3. Check: `codex login status` should print `Logged in using ChatGPT`.

Yomu never reads your Codex token; it only launches the official binary and adapter.

## Development

```bash
npm install
npm run tauri dev
```

Handy commands:

```bash
npm run lint && npm run typecheck   # frontend checks
cd src-tauri && cargo test          # Rust tests (uses a mock agent, no Codex needed)
cargo test real_codex -- --ignored --nocapture   # optional: real Codex, uses plan quota
```

## Using it

1. Paste a URL and press Open. Articles are saved to your library automatically.
2. Select a passage, then press **Explain** (or `Cmd/Ctrl+E`).
3. Ask follow ups in the panel. Chats are saved per article and resume after a restart.

## Releasing

Pushing a tag like `v0.1.0` runs `.github/workflows/release.yml`: it builds macOS (Apple Silicon and Intel), Windows and Linux installers and creates a draft GitHub release that includes `latest.json`, which the in-app updater reads (checked once at startup, signature verified against the public key in `tauri.conf.json`).

One time setup, in the repo's Settings > Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: contents of the updater private key (generated with `npx tauri signer generate`; the matching public key is already in `tauri.conf.json`). **Keep it safe. Losing it means installed apps can never be updated.** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is only needed if the key has a password.
- Optional macOS signing and notarization: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Without them the app is unsigned and macOS Gatekeeper warns on first open.
- Windows code signing is not configured yet; unsigned builds trigger SmartScreen warnings.

Local build: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/yomu-updater.key)" npm run tauri build` (the key is required because updater artifacts are enabled).

## Troubleshooting

- **"Couldn't start the Codex adapter"**: Node.js/`npx` isn't on the app's `PATH`. Launch from a terminal or install Node.
- **"Codex isn't signed in"**: run `codex login`.
- **Usage limit message**: your ChatGPT plan's Codex allowance is used up; try again after it resets.
- **Logs**: in the OS app log directory (macOS: `~/Library/Logs/com.yomu.app/`). They stay on your machine.

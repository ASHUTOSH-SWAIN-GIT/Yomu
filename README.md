# Yomu

A desktop reader for technical blogs, docs and research papers, with an AI agent from your own computer beside every article.

You open a blog post or a PDF, Yomu turns it into a clean, distraction-free page, and you can ask an agent (Codex, Claude Code, OpenCode, or any ACP agent you already have installed) about what you are reading. Everything is stored locally; there is no Yomu account and no API key.

## What it does

- **Read blogs and docs:** paste a link and Yomu fetches the article, strips the clutter and shows it in a reader view. Every article is saved to your library.
- **Read research papers:** open a PDF from your computer (`Cmd/Ctrl+O` or drag it onto the window). Yomu reflows it into readable text, a page at a time, under **Papers** in the sidebar.
- **Chat with an agent about it:** the chat panel beside the article knows what you are reading, including the page you are on in a paper. The agent can also search and read the rest of your library through Yomu's built-in tools.
- **Comment:** select any passage to leave a note in the margin.
- **Remember terms:** words the agent has explained before are underlined in other articles, with the earlier answer on hover.
- **Organise:** put articles in collections, keep several open as tabs, and search everything with `Cmd/Ctrl+K`.
- **Bookmarks inbox:** bookmark a page into a folder named **Yomu** in Chrome, Brave or Helium, and it shows up in Yomu's Inbox. No extension is needed.

## Agents

Yomu does not ship its own AI. It launches an agent that is already on your computer and talks to it over [ACP](https://agentclientprotocol.com), so usage counts against that agent's own plan (for example, your ChatGPT plan for Codex).

- **Off by default:** no agent runs until you pick one in **Settings → Agent** and accept a short notice about what gets sent to it. You're only asked once per agent.
- **Supported:** Codex, Claude Code, OpenCode, or a custom command that speaks ACP over stdio.
- **Sandboxed:** on macOS and Linux the agent runs fenced in. On Windows it runs with your own permissions, and Settings says so.
- **Your token stays with the agent:** Yomu never reads your agent's login. It only starts the official program.

## Requirements

| Tool                | Why                                                           |
| ------------------- | ------------------------------------------------------------- |
| Node.js 22+         | Frontend build, and runs the agent ACP adapters through `npx` |
| Rust (stable)       | Tauri core. Install with [rustup](https://rustup.rs)          |
| An agent CLI        | Codex (paid ChatGPT plan), Claude Code or OpenCode            |
| Tauri prerequisites | https://tauri.app/start/prerequisites/                        |

## Development

```bash
npm install
npm run tauri dev
```

Checks:

```bash
npm run lint && npm run typecheck && npm test   # frontend
cd src-tauri && cargo test                      # Rust (uses a mock agent)
cargo test real_codex -- --ignored --nocapture  # optional: real Codex, uses plan quota
```

**Stack:** Tauri 2, React, TypeScript, SQLite, pdf.js and ACP. See [ROADMAP.md](./ROADMAP.md), [docs/decisions](./docs/decisions) and [docs/pdf-support.md](./docs/pdf-support.md) for design notes.

## Shortcuts

| Shortcut         | Action                            |
| ---------------- | --------------------------------- |
| Cmd/Ctrl+K       | Search and commands               |
| Cmd/Ctrl+O       | Open a PDF                        |
| Cmd/Ctrl+Shift+V | Open the link on your clipboard   |
| Cmd/Ctrl+E       | Show or hide the chat             |
| Cmd/Ctrl+J       | Jump to the chat box              |
| Cmd/Ctrl+T, W    | New tab, close tab                |
| Cmd/Ctrl+B       | Show or hide the sidebar          |
| Cmd/Ctrl+.       | Focus mode (Esc leaves it)        |
| ← →              | Previous and next page in a paper |
| Cmd/Ctrl+/       | All shortcuts                     |

The **Aa** menu sets typeface, size, width and theme.

## Releasing

Pushing a tag like `v0.1.0` runs `.github/workflows/release.yml`: it builds macOS (Apple Silicon and Intel), Windows and Linux installers and creates a draft GitHub release that includes `latest.json`, which the in-app updater reads (checked once at startup, signature verified against the public key in `tauri.conf.json`).

One-time setup, in the repo's Settings > Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: contents of the updater private key (generated with `npx tauri signer generate`; the matching public key is already in `tauri.conf.json`). **Keep it safe. Losing it means installed apps can never be updated.** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is only needed if the key has a password.
- Optional macOS signing and notarization (also uncomment the `APPLE_*` lines in `release.yml`, they are off because empty secrets break the build): `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Without them the app is unsigned and macOS Gatekeeper warns on first open.
- Windows code signing is not configured yet; unsigned builds trigger SmartScreen warnings.

Local build: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/yomu-updater.key)" npm run tauri build` (the key is required because updater artifacts are enabled).

## Troubleshooting

- **The agent says "Off":** turn it on in Settings → Agent.
- **"Couldn't start the Codex adapter":** Node.js or `npx` isn't on the app's `PATH`. Launch from a terminal or install Node.
- **"Codex isn't signed in":** run `codex login`.
- **Usage limit message:** your agent plan's allowance is used up; try again after it resets.
- **"This PDF has no selectable text":** it's a scan; Yomu can't read scanned pages yet.
- **Logs:** in the OS app log directory (macOS: `~/Library/Logs/com.yomu.app/`). They stay on your machine.

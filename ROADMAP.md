# Yomu Roadmap

A desktop reader for technical blogs and docs. Highlight any passage and your own local Codex agent explains it, billed to your ChatGPT subscription.

Source: _Agent Native Technical Reader: Project Plan_ (Sep 23, 2026).

---

## Guiding principles

- **Agent native**: the app never runs its own model. It talks to Codex CLI on the user's machine over ACP (Agent Client Protocol).
- **No API keys**: users sign in with ChatGPT through Codex. Usage counts against their plan.
- **Local first**: no backend server in v1. Scraping, storage, and agent calls all happen on the user's machine.
- **Reader before agent**: the reader must work end to end before any agent code is written.
- **Swappable agent layer**: everything goes through one `AgentHarness` interface so Claude or Gemini can plug in later.
- **Content first design**: restrained UI, no gradients. References: Readwise Reader, Linear, Are.na.

## Core v1 loop

```
Paste URL -> Scrape and parse -> Render in reader -> Select text -> Explain -> Codex via ACP -> Streamed chat panel
                                        |
                                        +-> Save to library
```

## Tech stack

| Layer             | Choice                                             |
| ----------------- | -------------------------------------------------- |
| Desktop shell     | Tauri 2 (Rust core, native webview)                |
| UI                | React + TypeScript                                 |
| Styling           | Tailwind CSS                                       |
| UI primitives     | shadcn/ui (Radix)                                  |
| State             | Zustand                                            |
| Code highlighting | Shiki                                              |
| Math              | KaTeX                                              |
| Extraction        | `@mozilla/readability` + site specific rules       |
| JS heavy pages    | Hidden Tauri webview                               |
| Storage           | SQLite via `tauri-plugin-sql`                      |
| Agent protocol    | ACP (`@agentclientprotocol/sdk` or Rust ACP crate) |
| Agent             | Codex CLI + Codex ACP adapter                      |

---

## Phase 0: Decisions (before M1 code lands)

Resolve these first. Record each outcome in `docs/decisions/` as a short ADR.

- [x] **ACP client location**: Rust ACP crate in the core (decided, not yet validated with a spike)
- [x] **Codex distribution**: detect and guide install for v1, revisit bundling later
- [x] **Protocol**: ACP, for multi agent support
- [x] **ACP spike**: ran against real Codex with `@agentclientprotocol/codex-acp` (the `@zed-industries` package is deprecated and breaks on current Codex). Kept as the opt-in test `real_codex_streams_and_resumes`.

**Exit criteria**: all four items decided and written down; spike streams a response from Codex. ADRs are in `docs/decisions/`.

---

## M1: Project setup

**Goal**: a running, styled app shell with no features.

- [x] Scaffold Tauri 2 + React + TypeScript + Tailwind
- [x] Add shadcn/ui, Zustand, ESLint, Prettier, `cargo fmt`, `clippy`
- [x] CI: lint, typecheck, Rust build, unit tests on push
- [x] Design tokens
  - [x] Type scale tuned for long form reading
  - [x] Color tokens, light and dark
  - [x] Spacing scale
- [x] App shell layout
  - [x] Left sidebar: library
  - [x] Main area: reader
  - [x] Right panel: chat, collapsible
- [x] Theme toggle (system / light / dark)

**Exit criteria**: `tauri dev` opens the three pane shell in both themes; CI green.

---

## M2: Scrape and render

**Goal**: paste a URL, read it cleanly.

### Scraping pipeline (Rust command `scrape_url`)

- [x] Normalize URL: strip tracking params, use as cache key (redirect resolution happens at fetch time via the final response URL)
- [ ] Shortcuts first: `llms.txt`, markdown versions of docs pages, Medium RSS feed — deferred, plain fetch only for now
- [x] Plain HTTP fetch with a real User-Agent
- [x] Fallback: if the plain fetch fails or extracts under ~200 words, the page is re-read in a hidden webview and the fuller result wins (`src-tauri/src/scraper/render.rs`). Verified on a client-rendered test page (small and 2,500 blocks with Unicode), not yet on a page that really blocks plain fetches.
- [x] Extractor selection: Mozilla-style Readability (via the `readability` crate)
- [x] Convert cleaned HTML into block JSON
- [x] Auto detect code language when missing (hand written regex signatures, not a full highlight.js-style classifier)

### Block format

```json
{
  "blocks": [
    { "type": "heading", "level": 2, "text": "..." },
    { "type": "paragraph", "text": "..." },
    { "type": "code", "language": "yaml", "content": "..." },
    { "type": "image", "src": "...", "alt": "..." },
    { "type": "math", "tex": "..." }
  ]
}
```

- [x] Define block types in TypeScript and Rust (`src-tauri/src/scraper/blocks.rs` / `src/types/article.ts`, kept in sync by hand)

### Site rules

- [x] Kubernetes / Hugo docs (Docsy `.td-content`); tabs and callouts are not specially handled
- [x] Docusaurus
- [x] MkDocs (Material)
- [ ] dev.to done (`#article-body`); Hashnode not done
- [ ] Medium: a free article scrapes cleanly with a proper title (plain fetch got through when tested; curl got a Cloudflare 403). If Cloudflare does block, the hidden webview is tried, then a clear "blocked by a bot check" error. RSS fallback not built: it only covers each publication's latest 10 posts and paywalled ones come back empty.

### Reader components

- [x] Heading
- [x] Paragraph (inline code, links, emphasis — rendered from structured spans, not raw HTML)
- [x] Code block with Shiki (fine grained bundle, JS regex engine, light/dark themes)
- [x] Image (lazy load, alt text; offline cache and "Ask about image" added later, see docs/next-steps.md)
- [x] Math with KaTeX

### Tests

- [x] Unit tests for HTML → block conversion, language detection, and URL normalization (`cargo test`, 16 passing)
- [ ] Fixture HTML snapshots pulled from real target sites — deferred until site rules land

**Fixed (Theme 2)**: the mdBook failure on the Rust book. Docs frameworks now have content rules in `src-tauri/src/scraper/rules.rs`.

**Exit criteria**: a Kubernetes doc page, a dev.to post, and a free Medium article all render cleanly.

**Out of scope**: paywalled content (show only what is public), bulk crawling.

---

## M3: Library

**Goal**: articles persist locally.

- [x] SQLite setup with migrations (`tauri-plugin-sql`, migration in `src-tauri/src/db.rs`)
- [x] Schema: `articles`, `highlights`, `chats`, `messages` (`highlights`/`chats`/`messages` created now, unused until M5)
- [x] Commands: save (upsert), list, open, delete — implemented as `@tauri-apps/plugin-sql` calls from `src/lib/db.ts` rather than bespoke Tauri commands, plus a `canonicalize_url` command for cache lookups without a network call
- [x] Cache by canonical URL (re-opening a saved URL skips the network — verified: no second `scrape_url` call on reopen)
- [x] Sidebar list: title, site, relative saved date; search by title/site
- [x] Highlights stored as block index + character offsets (wired in M5)

**Exit criteria**: save, restart the app, reopen offline, delete. No duplicates for the same canonical URL. Verified end to end (mocked backend): open → saved, reopen same URL → cache hit not re-scraped, reopen via sidebar → no scrape, delete → row removed.

---

## M4: Codex connection

**Goal**: the app can reach a logged in Codex and stream a reply.

### Onboarding

- [x] Detect Codex install (`agent_status` runs `codex --version`) — adapter presence isn't checked separately yet
- [x] Check login status (best guess `codex login status` parsing — **unverified against a real Codex install**, see below)
- [x] "Sign in with ChatGPT" button runs `codex login`
- [x] `agent_status` command: `missing | logged_out | ready`

### ACP client

- [x] `AgentHarness` (`src-tauri/src/agent/harness.rs`): `new_session`, `prompt`; status/login live in `agent/status.rs`
- [x] Spawn adapter, JSON-RPC over stdio — hand rolled (`agent/rpc.rs`) rather than a third party ACP crate, see note below
- [x] `session/new` with an empty temp dir as cwd
- [x] `session/prompt` and stream `session/update` chunks
- [x] Normalize events for the UI: `token`, `done`, `error`, `permission_request` (`agent/events.rs`)

### Safety

- [x] Read only sandbox: no file writes, no shell commands are ever issued by the harness itself
- [x] Temp working directory, never user projects (`agent_new_session` always creates a fresh temp dir)
- [x] Permission requests surfaced in UI, default deny (no code path grants one)

### Lifecycle

- [x] Restart adapter on crash (`connection()` checks `has_exited()` and respawns)
- [x] Kill all child processes on app quit (`kill_on_drop` plus an explicit `ExitRequested` handler)

### Auth rules (non negotiable)

- Never read, copy, or send the Codex token
- Never call OpenAI's backend directly
- All model calls go through the official Codex binary

**Exit criteria**: fresh machine -> install prompt -> login -> "hello" prompt streams back in a debug panel. Verified against a mock ACP agent (below); **not yet verified against real Codex**.

### Verified against real Codex (M5 follow up)

M4 was first built against a mock with a guessed protocol. That is now corrected and checked against Codex CLI 0.142 + `@agentclientprotocol/codex-acp@1.13.1`:

- Real wire format: numeric `protocolVersion`, `session/new` needs `mcpServers`, text streams as `session/update` → `agent_message_chunk`, and there is no `done` notification (the prompt response carries `stopReason`, so the harness emits `Done` itself).
- Codex sessions default to an auto-approve mode. The harness now calls `session/set_mode` → `read-only` on every new or resumed session and fails the session if that fails.
- **Sandbox reality**: `read-only` still allows writes _inside the session's cwd_. That cwd is always a fresh empty temp dir, so nothing outside is reachable, but "no file writes at all" is not literally true. The explain prompt also tells the agent not to use tools.
- Permission requests from the agent are always answered "cancelled" (`agent/rpc.rs`).
- Login check (`codex login status`) works: it prints "Logged in using ChatGPT" to **stderr** (not stdout) and exits 0; `agent/status.rs` reads both.
- The mock agent (`scripts/mock-acp-agent.mjs`) now speaks the real shapes so CI still needs no Codex. Real run: `cargo test real_codex -- --ignored --nocapture`.
- GUI launches have a minimal `PATH`; `env::inherit_shell_path` (M6) merges the login shell's `PATH` at startup. Unit tested, **not yet tried from a Finder-launched bundle**.

---

## M5: Explain

**Goal**: the full v1 loop works.

- [x] Text selection listener with floating "Explain" button
- [x] Explain flow: `explain()` in `src/stores/chat-store.ts` (frontend store instead of a Rust command; the prompt is built in `src/lib/prompt.ts`)
- [x] Prompt builder
  - [x] Style: explain for a developer, reference the article, concise, code examples when useful
  - [x] Context: title, URL, section heading, surrounding paragraphs, selection
  - [x] Full article only if short; otherwise nearby sections
- [x] Chat panel with streaming and markdown rendering (reuse Shiki and KaTeX)
- [x] `send_followup(text)` in the same ACP session
- [x] One session per article; persist `acp_session_id` to resume
- [x] Save highlights and messages to SQLite
- [x] Error states in the panel
  - [x] Codex not installed
  - [x] Logged out
  - [x] Plan usage limit hit
  - [x] Adapter crash

**Exit criteria**: paste URL, select a paragraph, get a streamed explanation, ask a follow up, restart the app, and see the chat still there.

Status: backend verified against real Codex (streaming, resume with context). The UI flow builds, lints and launches in `tauri dev` but has **not yet been clicked through end to end** in the real window.

---

## M6: Hardening and v1 release

- [x] Performance: scrape times measured (`cargo test scrape_timing -- --ignored --nocapture`): 0.5–1.3 s on Kubernetes docs, react.dev and Wikipedia pages. Blocks use `content-visibility: auto` for long pages. No in-browser render benchmark on a huge page yet.
- [x] Accessibility pass: input labels, `role="log"` live region for chat, `Cmd/Ctrl+E` keyboard path for Explain, and contrast computed for both themes (fixed low contrast error text, dark destructive button, and input borders; all text pairs now ≥ 4.5:1, control borders ≥ 3:1). **No screen reader run yet.**
- [x] Crash and error logging (local only): `tauri-plugin-log` to the OS app log dir (`~/Library/Logs/com.yomu.app/` on macOS); agent, scrape and chat errors are logged
- [ ] Packaging and signing for macOS, Windows, Linux: macOS `.app` and `.dmg` build locally and `.github/workflows/release.yml` builds all three platforms on a version tag. **Not yet run on CI.** Signing needs your certificates as repo secrets (see README "Releasing"); Windows signing is not configured.
- [x] Auto update channel: `tauri-plugin-updater` checks GitHub Releases' `latest.json` at startup and shows an "Update and restart" banner. Updater keypair generated (public key in `tauri.conf.json`, private key at `~/.tauri/yomu-updater.key`, no password) and a signed build verified locally. **Needs the private key added as the `TAURI_SIGNING_PRIVATE_KEY` repo secret, and a first release published, before an update can actually be delivered.**
- [ ] Review OpenAI terms on subscription use in third party apps
- [x] README, install guide, Codex setup guide
- [ ] Private beta with a handful of developers; collect feedback

**Exit criteria**: signed builds on all three platforms; beta users complete the core loop without help.

---

## Post v1 (not scheduled)

- Claude support once Anthropic approves subscription use in third party apps
- Gemini via ACP
- Highlight overlays and notes in the reader
- Search across saved articles and chats
- Export (markdown) of articles with explanations
- Sync across devices (open question: local only for good?)

---

## Risks

| Risk                                                              | Mitigation                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| OpenAI changes rules on subscription use in third party apps      | Keep `AgentHarness` swappable; review terms before launch           |
| Codex ACP adapter is community maintained, may lag Codex releases | Pin versions; watch upstream; keep app server protocol as fallback  |
| Medium and other sites block or change markup                     | RSS fallback, hidden webview, fixture tests to catch breakage early |
| Onboarding friction (Codex install + login)                       | Clear status screen, one click login, good docs                     |

## Open questions

- [ ] ACP client in a Node sidecar (TS SDK) or in Rust (ACP crate)?
- [ ] Bundle the Codex binary or ask users to install it?
- [ ] ACP adapter or Codex's own app server protocol?
- [ ] When to apply to Anthropic for Claude subscription approval?
- [ ] Sync across devices later, or local only for good?

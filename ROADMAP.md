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
- [ ] **ACP spike**: throwaway script that spawns the adapter, opens a session, sends a prompt, prints streamed updates. Do this before M4.

**Exit criteria**: all four items decided and written down; spike streams a response from Codex.

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
- [ ] Fallback: if extracted text is under ~200 words, retry in a hidden webview — deferred, needs the hidden webview from M4/M5 era tooling
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

- [ ] Kubernetes / Hugo docs (tabs, callouts) — generic Readability extraction only so far
- [ ] Docusaurus
- [ ] MkDocs
- [ ] dev.to, Hashnode
- [ ] Medium (bot checks, missing code language tags, lazy images, RSS fallback)

### Reader components

- [x] Heading
- [x] Paragraph (inline code, links, emphasis — rendered from structured spans, not raw HTML)
- [x] Code block with Shiki (fine grained bundle, JS regex engine, light/dark themes)
- [x] Image (lazy load, alt text)
- [x] Math with KaTeX

### Tests

- [x] Unit tests for HTML → block conversion, language detection, and URL normalization (`cargo test`, 16 passing)
- [ ] Fixture HTML snapshots pulled from real target sites — deferred until site rules land

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
- [ ] Highlights stored as block index + character offsets — table exists, wiring lands with M5 (Explain)

**Exit criteria**: save, restart the app, reopen offline, delete. No duplicates for the same canonical URL. Verified end to end (mocked backend): open → saved, reopen same URL → cache hit not re-scraped, reopen via sidebar → no scrape, delete → row removed.

---

## M4: Codex connection

**Goal**: the app can reach a logged in Codex and stream a reply.

### Onboarding

- [ ] Detect Codex install (and adapter)
- [ ] Check login status
- [ ] "Sign in with ChatGPT" button runs `codex login` and opens the browser
- [ ] `agent_status` command: `missing | logged_out | ready`

### ACP client

- [ ] Implement `AgentHarness` interface (`status`, `login`, `newSession`, `prompt`)
- [ ] Spawn adapter, JSON-RPC over stdio
- [ ] `session/new` with an empty temp dir as cwd
- [ ] `session/prompt` and stream `session/update` chunks
- [ ] Normalize events for the UI: `token`, `done`, `error`, `permission_request`

### Safety

- [ ] Read only sandbox: no file writes, no shell commands
- [ ] Temp working directory, never user projects
- [ ] Permission requests surfaced in UI, default deny

### Lifecycle

- [ ] Restart adapter on crash
- [ ] Kill all child processes on app quit

### Auth rules (non negotiable)

- Never read, copy, or send the Codex token
- Never call OpenAI's backend directly
- All model calls go through the official Codex binary

**Exit criteria**: fresh machine -> install prompt -> login -> "hello" prompt streams back in a debug panel.

---

## M5: Explain

**Goal**: the full v1 loop works.

- [ ] Text selection listener with floating "Explain" button
- [ ] `start_explain(selection, articleId)` command
- [ ] Prompt builder
  - [ ] Style: explain for a developer, reference the article, concise, code examples when useful
  - [ ] Context: title, URL, section heading, surrounding paragraphs, selection
  - [ ] Full article only if short; otherwise nearby sections
- [ ] Chat panel with streaming and markdown rendering (reuse Shiki and KaTeX)
- [ ] `send_followup(text)` in the same ACP session
- [ ] One session per article; persist `acp_session_id` to resume
- [ ] Save highlights and messages to SQLite
- [ ] Error states in the panel
  - [ ] Codex not installed
  - [ ] Logged out
  - [ ] Plan usage limit hit
  - [ ] Adapter crash

**Exit criteria**: paste URL, select a paragraph, get a streamed explanation, ask a follow up, restart the app, and see the chat still there.

---

## M6: Hardening and v1 release

- [ ] Performance: large docs pages render smoothly; scrape under a few seconds on normal pages
- [ ] Accessibility pass: keyboard navigation, focus states, contrast in both themes
- [ ] Crash and error logging (local only)
- [ ] Packaging and signing for macOS, Windows, Linux
- [ ] Auto update channel
- [ ] Review OpenAI terms on subscription use in third party apps
- [ ] README, install guide, Codex setup guide
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

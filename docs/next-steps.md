# Yomu: from skeleton to daily driver

## Context

M1–M6 are built: paste a URL, read it, select text, Explain via real Codex, chats persist, local logging, update channel, release workflow. The loop works but it is a skeleton. Goal for the next stretch: **something you'd use every day**. Chosen scope: all four areas (reader coverage, explain experience, library, onboarding/trust), as an ordered roadmap with detailed steps only for the first theme.

## Gaps found in the code today

- **No way to stop a reply.** No cancel path anywhere (`session/cancel` is unused in `src-tauri/src/agent/`).
- **First Explain is slow** (Codex adapter starts lazily through `npx`, about 10–30 s). Nothing pre-warms it.
- **Highlights are saved but invisible.** The `highlights` table is filled (`src/lib/db.ts` `addHighlight`) but the reader never shows them.
- **Lists are flattened to paragraphs, tables and blockquotes are lost** (`src-tauri/src/scraper/blocks.rs`, `"li"`/`"p" | "blockquote"` arms). That also degrades the context sent to the agent.
- **Site extraction fails on some pages:** the Rust book (mdBook) returns "could not extract readable content".
- **Library is thin:** title/site search only, no tags, no read state or scroll position, no export, delete has no confirmation.
- **Accessibility miss from M6:** sidebar rows are clickable `div`s (`library-sidebar.tsx`), not keyboard reachable.
- **Trust:** `csp` is `null` in `tauri.conf.json`; no frontend tests exist and CI runs none.

## Ordered roadmap

| #   | Theme                    | Why this order                                                                                                                           | Size |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | **Explain experience**   | The differentiator, and the most-felt daily friction (waiting, no stop). Self-contained, no schema changes.                              | S–M  |
| 2   | **Reader fidelity**      | Pages that fail or lose structure erode trust fast. Bigger: touches the block schema in Rust, TS, renderer and prompts.                  | M–L  |
| 3   | **Library**              | Only pays off once there is more content and more highlights to find again.                                                              | M    |
| 4   | **Onboarding and trust** | Least important for you as the daily driver, essential before strangers use it. Tests (4b) can move earlier if regressions start biting. | M    |

Parked: agent picker (Claude/Gemini via ACP), sync, browser extension.

### Theme 2: Reader fidelity

**Status: implemented except the two fallbacks below.** Checked on real pages (`cargo test scrape_timing -- --ignored --nocapture`): Kubernetes, the Rust book (was failing), react.dev, Wikipedia, Docusaurus, MkDocs Material and a dev.to post all extract with correct titles in 0.4–1.3 s. The dev.to post produced 4 tables, 3 quotes and 3 lists. Not yet viewed in the app window.

Done: `list` (with nesting), `quote` and `table` blocks end to end (Rust, TS types, renderers, prompt text); list markers are CSS so selecting an item doesn't include "•"; site rules for mdBook, Docusaurus, MkDocs Material, Hugo Docsy and dev.to with per-site title sources; heading permalink glyphs stripped; "Re-fetch article" button so articles saved earlier get the new blocks.

**Not done, and why**

- Hidden webview fallback for JS-rendered pages: needs its own design (webview lifecycle, getting the rendered HTML back over IPC, interaction with a future CSP).
- Medium (RSS fallback, bot checks): depends on the same fallback work.
- Hashnode rule, Docusaurus/Kubernetes tabs and callouts, Wikipedia infobox tables (Readability drops them).

Original outline:

- Extend `Block` additively: `list {ordered, items}`, `table {headers, rows}`, `quote`. Old saved articles keep working (variants are additive), add a "Re-scrape" action to upgrade them.
- Site rules module (`scraper/rules.rs`): pick a content selector by host/markers before Readability (mdBook `#content main`, Docusaurus `article`, MkDocs `.md-content`, Hugo/K8s `.td-content`, dev.to `#article-body`). Fixture HTML tests per site.
- Fallback for JS-rendered pages when extracted text is under ~200 words (hidden webview), and Medium RSS fallback. These are the roadmap's deferred M2 items.

### Theme 3 outline

- Migration v2 in `src-tauri/src/db.rs`: FTS5 index over article text and messages; search UI across both. Tags/collections, read/archive state, saved scroll position, markdown export (article plus explanations), delete confirmation, sidebar rows as real buttons.

### Theme 4 outline

- First-run wizard with fix-it steps (Node, Codex, login). Real CSP (script-src self; img-src https/data; ipc connect) and a setting to block remote images. Vitest for `src/lib/prompt.ts`, `chat-errors.ts`, `chat-store.ts` (mock `@/lib/commands`), added to CI. Screen reader pass. First real run of `release.yml`, Windows `PATH` check.

## Theme 1 in detail: Explain experience

**Status: implemented, not yet clicked through in the app.** Checked so far: Rust tests (mock cancel test), `session/cancel` against real Codex (stops with `stopReason: "cancelled"`), typecheck, lint, build. Still to check by hand: first Explain speed after launch, Stop mid-answer, shaded highlights and click-to-jump, Copy/Regenerate/chips, Summarize, keyboard use of the sidebar.

Build order, each step independently shippable:

1. **Pre-warm the agent.** Add `AgentHarness::warm()` (calls the existing private `connection()` in `agent/harness.rs`), an `agent_warm` command in `lib.rs`, register it, and call it from `agent-store.ts` `refreshStatus()` when status becomes `ready`. Log elapsed time so we can see the win.
2. **Stop generation.** ACP `session/cancel` is a notification `{sessionId}`; the pending prompt then resolves with `stopReason: "cancelled"`.
   - `rpc.rs`: add `RpcClient::notify(method, params)` next to `request` (reuse `write_line`).
   - `harness.rs`: `cancel(session_id)`; `lib.rs`: `agent_cancel` command; `commands.ts`: `agentCancel`.
   - `chat-store.ts`: `stop()`. The existing `done` handler already persists whatever text streamed, so partial answers are kept.
   - `chat-panel.tsx`: Send button becomes Stop while `streaming`.
   - `scripts/mock-acp-agent.mjs`: honour `session/cancel` (end the turn early) and add a `agent/tests.rs` case.
3. **Show past highlights in the reader.** New `listHighlights(articleId)` in `db.ts`, loaded by `chat-store.loadForArticle`. New hook `src/hooks/use-highlights.ts` builds DOM `Range`s from `data-block-index` + offsets (walking text nodes, the same measure `use-text-selection.ts` uses) and paints them with the CSS Custom Highlight API (`CSS.highlights`, `::highlight(yomu)` in `index.css`), so no changes to `paragraph-block.tsx`. Feature-detect and skip silently where the webview lacks it. Clicking a highlight scrolls the chat to its message.
4. **Answer actions.** On assistant messages: Copy, Regenerate (re-run via the existing `retry`/`lastBuild` in `chat-store.ts`). Quick follow-up chips after an answer ("Simpler", "Go deeper", "Show an example") that call the existing `send`.
5. **Summarize without a selection.** "Summarize this article" in the chat empty state, using a new `buildSummaryPrompt` next to `buildPrompt` in `src/lib/prompt.ts`.

Quick bundle done alongside: sidebar rows to real `<button>`s and a delete confirmation.

## Verification for Theme 1

- `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` (new cancel test against the mock).
- Opt-in real check: extend `real_codex_streams_and_resumes`-style test with a cancel mid-stream (`cargo test real_codex -- --ignored --nocapture`).
- `npm run typecheck && npm run lint && npm run build`.
- Manual in `npm run tauri dev` (you drive it): first Explain is noticeably faster after launch; Stop mid-answer keeps partial text and re-enables input; reopen the article and past highlights are shaded; Copy/Regenerate/chips work; a keyboard-only pass over the sidebar.
- Update `ROADMAP.md` with a new "Next" section recording these themes and their status.

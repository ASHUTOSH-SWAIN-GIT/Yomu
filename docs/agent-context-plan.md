# A smarter, better-grounded agent + a more robust scraper

## Context

Yomu's loop works, but two things hold back quality: the **prompt is thin and isolated** (one passage, no memory of earlier questions, no knowledge of your other saved articles, no sense of your skill level, and Codex is barred from checking anything against the real internet), and the **scraper is guesswork-based** (author/date come from meta tags, no encoding detection, paywalled pages fail with a confusing generic error, and clean raw Markdown that many docs sites already publish is ignored in favour of scraping their rendered HTML).

Decisions made with you:

- **Agent power**: allow controlled web browsing so Codex can verify facts and cite sources, instead of the current hard "never touch the internet" rule.
- **Context sources**: build all four — richer single-article context, memory of earlier Q&A in the article, cross-article knowledge from your library, and a personalization setting (skill level).
- **Scraper focus**: generic robustness (JSON-LD metadata, encoding detection, paywall detection, retry on transient errors) and llms.txt/Markdown shortcuts for docs sites.

## Track A — Agent context and safety

### A0. Spike: verify what a real web-fetch permission request looks like (do this first, before any behavior change)

Codex's `read-only` mode still asks permission before using the internet (confirmed earlier: its description is "Always ask to edit external files and use the internet"). Today `rpc.rs::reply_to_agent_request` denies every `session/request_permission`, whatever it's for. To allow browsing while still blocking file writes and shell commands, we must be able to tell those apart from the real payload — not guess. Spike script (same pattern as the earlier ACP spikes): ask Codex a question that requires a live lookup (e.g. "what is the latest stable Rust version, check online"), capture the exact `session/request_permission` JSON Codex sends (its `toolCall.kind`/`title`/`rawInput` shape), and confirm approving it actually lets the fetch proceed and denying it doesn't. This determines the classification rule A5 codes against — if the shape doesn't cleanly distinguish fetch from file/exec, we stop and reconsider (e.g. fall back to a narrower allowlist or a different mode) rather than guess.

### A1. Prompt context refactor + grounding

**Status: done.** `buildPrompt` now takes a `PromptOptions` object (`question`, `kind`, `fullContextAlreadySent`). Added: a table-of-contents line ("Section 2 of 3. All sections: ...", omitted for articles with fewer than 2 headings); per-session tracking (`fullContextSentFor` in `chat-store.ts`, keyed by live ACP session id, cleared on article switch) that skips resending the full article body on a second Explain in the same session — only applies when the article is short enough to send in full to begin with; a stronger grounding instruction ("quote exact phrases... rather than paraphrasing loosely"). 228 frontend tests pass (was 218), including a mutation check that both the prompt-level and store-level skip logic are actually exercised, not just present. Verified against real Codex: with the context omitted on turn 2 of a live session, it correctly still recalled the article's content from turn 1, confirming the skip is safe.

### A1. Prompt context refactor + grounding (original plan)

- `buildPrompt`/`buildSummaryPrompt` (`src/lib/prompt.ts`) move from positional optional args to one `PromptContext` options object (question, kind, plus the new fields below) — cleaner as the number of context sources grows. Update all call sites in `chat-store.ts` and `prompt.test.ts`.
- Add table-of-contents awareness: list the article's headings so the model knows where the passage sits in the whole piece ("Section 3 of 7").
- Stop re-sending the full article context on the second-and-later Explain within the same live ACP session — the model already has it from the first turn. `chat-store` tracks a per-session `contextSent` flag; `buildPrompt` gets a `fullContextAlreadySent` flag and sends only the immediate surrounding blocks when true. Cuts token/quota use noticeably on articles you explain several passages of.
- Strengthen the grounding instruction: tell the model to quote exact phrases from the article when it helps, to reduce hallucinated details.

### A2. Memory of past explanations

**Status: done.** New `priorExplanations()` in `lib/exchanges.ts` (plus a `firstSentence()` gisting helper in `lib/text.ts`), threaded through `chat-store.ts`'s `specFor` into `buildPrompt`'s options. Key refinement made while implementing: this only needed to fire when the ACP session was freshly (re)created (`fresh` from `ensureSession`) — a _continuing_ session already has every earlier exchange about other passages verbatim in its own history, so injecting a condensed summary there would be pure waste. Only the "session had to be recreated" case lacks that history, which is exactly when this now supplies a short "already explained elsewhere" list. 233 frontend tests pass (was 223 after A1), with a mutation check confirming both the exclude-self filter and the fresh-only gating are actually exercised.

### A2. Memory of past explanations (original plan)

`chat-store` builds a short "already covered in this article" list from its own `highlights`/`messages` state (excluding the current one) — quoted passage plus the first sentence of its answer — and passes it into `PromptContext` for a fresh "question"-kind prompt (not needed for in-session follow-ups, which already have it via ACP history). Lets the model say "as covered above" instead of repeating itself.

### A3. Cross-article knowledge (your library)

**Status: done.** New `relatedArticles()` in `lib/db.ts`, wired through `chat-store.ts` into `buildPrompt`'s options, explicitly framed to the model as secondary ("only mention if genuinely relevant"). Restricted to other articles' _bodies_ (`kind = 'article'`), never their chat history, and always excludes the currently open article. Real bug found by testing against actual SQLite (not just mocks): the existing `toMatchQuery` requires every word to match, which is right for a short typed search but wrong here — the "query" is a whole highlighted passage or question, and requiring every one of its words to appear in another document almost never matched anything. Fixed with a new `toRelatedQuery()` that ORs the passage's more distinctive words instead (dropping short/filler words, capped at 12 terms), verified against a real in-memory SQLite database with real triggers before writing a single mocked unit test. Skipped for image questions (no useful search text) and never lets a search failure block the explain itself. 243 frontend tests pass (was 233 after A2), with a 3-way mutation check (OR-vs-AND semantics, the render guard, and the image skip) all confirmed to actually fail without the real code.

### A3. Cross-article knowledge (your library) (original plan)

New `relatedArticles(excludeArticleId, queryText, limit)` in `src/lib/db.ts`, reusing the existing FTS5 search (`searchLibrary`/`toMatchQuery` from M3) rather than building new retrieval. Before asking, `chat-store` looks up matches for the passage/question text, and passes the top 2–3 (title + snippet) into `PromptContext`, explicitly marked as optional/secondary so the model doesn't treat them as more authoritative than the open article.

### A4. Personalization

**Status: done.** New `lib/explain-prefs.ts` (skill level: New/Balanced/Expert; code examples: Never/When helpful/Always), persisted the same way as reader prefs, with a small control added to the Aa menu (confirmed by screenshot to fit the panel width). Applied inside `specFor` itself in `chat-store.ts` — one place, so it reaches every explain/follow-up/regenerate prompt automatically rather than needing to be threaded into each call site by hand. `lib/prompt.ts` stays fully decoupled from what a "level" means: it only receives plain instruction sentences (`personalizationNotes`) to append, exactly as planned. 258 frontend tests pass (was 243 after A3), with a mutation check on both the instruction-mapping and the wiring into `specFor`.

**Track A1–A4 status: all done.** This closes the non-safety-sensitive half of Track A. What remains is A0 (a real spike against Codex to see the actual shape of a web-fetch permission request) and A5 (wiring controlled browsing from what A0 finds) — deliberately last, since it's the one change that touches the sandbox's safety guarantee and needs verifying against the real thing before any code is written against a guess.

### A4. Personalization (original plan)

New persisted prefs in `stores/ui-store.ts` (same localStorage pattern as reader prefs): `explainLevel` ("new to this" / "balanced" / "experienced") and `codeExamples` ("always" / "when helpful" / "never"). A small control in the Aa menu (`reader-settings.tsx`). Read into `PromptContext` by the caller (kept out of `lib/prompt.ts` itself, which stays a pure, store-free function for testability).

### A5. Controlled web access (built from A0's findings)

- `rpc.rs`: replace blanket denial with a classifier — auto-approve only permission requests A0 confirms are network/fetch, auto-deny everything else (file edit/delete/move, execute, and anything unrecognized — fail closed).
- `harness.rs`: unchanged mode (`read-only`) — file writes and shell commands stay blocked exactly as today; only network fetch changes.
- A persisted setting, default **on**: "Let the agent browse the web for citations" (Aa menu, next to the personalization controls from A4). Turning it off restores today's fully offline behavior with no code path changes needed (the classifier is simply never consulted — deny-all when off).
- Prompt wording (A1) tells the model it may browse to verify facts or find official docs when useful, and to say when it did.

### A6. Docs

Update `ROADMAP.md`'s M4 safety section (today says "no shell commands, no file writes... default deny") to describe the new, narrower guarantee precisely, plus the off switch. Update `README.md`. Note the honest residual risk: article text (possibly containing attacker-controlled instructions, i.e. prompt injection) can now cause the agent to fetch a URL of its choosing — no credentials or file access are exposed, but this is a real change from "fully offline," and is stated plainly rather than glossed over.

## Track B — Scraper robustness

**Status: done.** 100 Rust tests (was 68), clippy clean. Verified against real sites, not just synthetic HTML:

- **B1 (JSON-LD):** dev.to now gives correct author, publisher name and a real `published_at` timestamp where before it had none; Medium/Kubernetes/react.dev fall back to meta tags as before (no JSON-LD on those pages for our UA).
- **B2/B4 (encoding + retry):** verified against a local mock server (header charset, `<meta charset>` sniffing, non-UTF-8 decoding, a 503-then-200 retry, and confirming a real 404 is _not_ retried). A live non-UTF-8 page wasn't found to test against — the web has moved almost entirely to UTF-8, which is itself worth knowing.
- **B3 (paywall):** phrase-based, same shape as the existing bot-check heuristic; unit-tested only — a real, reachable paywalled article wasn't found in this environment (NYT blocked outright at the network level; Medium's paywalled posts weren't easy to locate via search). Treat as best-effort like the bot-check heuristic it mirrors.
- **B5 (Markdown/llms.txt shortcuts):** the biggest addition. New `pulldown-cmark`-based block converter, matching the HTML pipeline's exact shapes (nested list flattening with `depth`, standalone-image promotion, plain-text headings). Verified on real pages: a GitHub README (via the raw.githubusercontent.com rewrite, 254ms), Mintlify and Vite's docs (both serve raw `.md`), confirmed noticeably faster than the HTML path on the same domains. Two real bugs found and fixed by that verification, not by guessing: YAML frontmatter (common on VitePress/Astro-based docs) was leaking into the article as stray text before `ENABLE_YAML_STYLE_METADATA_BLOCKS` was enabled; and the title search only checked the very first block, missing a real H1 that Mintlify's docs put after a preamble callout — fixed by searching the first 6 blocks instead of just the first.
- `github.com/owner/repo` (a repo root, not a `/blob/` file URL) has no guessable raw-markdown route and correctly falls through to the normal HTML pipeline — known, documented limitation, not a bug.

### B1. JSON-LD metadata

New `scraper/jsonld.rs`: parse `<script type="application/ld+json">` for schema.org `Article`/`NewsArticle`/`BlogPosting` (`author`, `datePublished`, site). Far more sites embed this correctly than set clean meta tags. Wins over the current meta-tag guesses in `meta.rs` when present. New `published_at` column (migration 4 in `db.rs`, following the existing `article_images` migration), surfaced in the reader header as "Published 3 days ago" alongside "Saved 5 hours ago."

### B2. Character-encoding detection

`fetch.rs` currently trusts `reqwest`'s default (header charset, else UTF-8), which misses sites that only declare `<meta charset>` in the HTML body. Fetch raw bytes, check the header first, then sniff `<meta charset>` in the first ~1KB, decode with `encoding_rs`, fall back to UTF-8 lossy. Fixes mojibake on older/non-English blogs.

### B3. Paywall detection

Phrase-based heuristic (`scraper/paywall.rs`, same shape as the existing `render::looks_like_bot_check`): "members only," "sign up to continue reading," "for paying subscribers," etc. A confident match yields a clear `ScrapeError::Paywalled` ("this article is behind a paywall; only the preview is available") instead of a generic extraction failure or silently presenting a teaser as the whole article.

### B4. Retry with backoff

Wrap the fetch in `fetch.rs` with up to 2 retries on transient failures (timeout, connection reset, 502/503/504), not on 4xx (no point retrying a real 403/404).

### B5. Markdown / llms.txt shortcuts

New `scraper/markdown_source.rs`: before the HTML pipeline, try known raw-Markdown patterns for the given URL — path + `.md` (works on Mintlify, GitBook, VitePress, many Docusaurus sites) and the GitHub `blob` → `raw.githubusercontent.com` rewrite. If a candidate returns 200 with markdown-like content (no `<html`), parse it directly into our `Block` enum with `pulldown-cmark` (new dependency) instead of scraping rendered HTML — faster and near-perfect on sites that support it. Falls back to the existing pipeline otherwise, so nothing that works today regresses.

## Reuse

`searchLibrary`/`toMatchQuery` (`src/lib/db.ts`), the reader-prefs localStorage pattern (`ui-store.ts`), `render::looks_like_bot_check`'s phrase-matching shape (for B3), the existing migration pattern in `db.rs`, the `buildPrompt`/`buildSummaryPrompt` test suite (`prompt.test.ts`) to extend rather than replace, `chat-store.ts`'s existing session/context machinery (`lastHighlight`, `specFor`, `runTurn`).

## Suggested build order

Track B and A1–A4 have no safety implications and no dependency on A0/A5 — build and ship those first. A0 (spike) and A5 (browsing) are the most sensitive part, need your Codex login, and should come last within Track A so the classifier is verified against real payloads before it ships, not guessed at.

## Verification

- **A0**: real spike output captured before any denial-logic code is written.
- **A1–A4**: extend `prompt.test.ts` for the options-object refactor, TOC text, reduced re-sent context, and the memory/related-article/personalization injection points (each as a pure function taking explicit inputs, no store mocking needed beyond what `chat-store.test.ts` already does); `cargo test`/`npm test` stay green throughout.
- **A5**: `agent/tests.rs` mock-agent case for "network permission approved, file-write permission still denied"; then the same scenario against real Codex (`cargo test real_codex -- --ignored`) once A0 confirms the shape.
- **B1–B4**: unit tests with synthetic HTML/bytes (JSON-LD present/absent, non-UTF-8 bytes, paywall phrases, a mocked 503-then-200 sequence), plus a real-page timing run (`cargo test scrape_timing -- --ignored --nocapture`, the existing harness) against a handful of real URLs chosen to exercise each case (a non-UTF-8 blog, a known paywalled article, a Docusaurus/Mintlify site for B5, a GitHub README).
- Full check suite each phase: `npm run lint && npm run typecheck && npm test && npm run build`, `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`.

## Risks

- A5 is the one real risk: it turns "fully offline" into "no file/exec access, but can fetch URLs of its own choosing," which is a genuine trust boundary change, not just a UI toggle. Mitigated by fail-closed classification, an off switch, and honest documentation — but the risk is real, not eliminated.
- B5's markdown parsing must map `pulldown-cmark`'s event stream onto our exact `Block`/`Span` shape (including nested lists' `depth`, which the HTML path already computes) — worth a focused set of unit tests rather than assuming parity with the HTML pipeline.
- Paywall/bot-check heuristics (B3) are phrase lists and will miss sites with wording we haven't seen; treated as best-effort, same as the existing bot-check heuristic.

# Agent roadmap: making Yomu's agent more useful

Written 2026-10-08 after a scan of the agent harness (`src-tauri/src/agent/`),
the chat stores and the chat UI. Effort: **S** = an afternoon, **M** = a few
days, **L** = a week or more.

## 1. Goal and principles

Make the agent something you reach for while reading, not a chat box on the
side.

- **Read-only, always.** The agent never writes files or runs commands (macOS
  sandbox in `agent/sandbox.rs`, default-deny permissions in `agent/rpc.rs`).
- **Local-first.** Nothing leaves the computer except prompts to the agent the
  user chose.
- **Cites sources.** Answers that use the library point at the blog and
  paragraph they came from.
- **Never blocks reading.** Long work runs in the background, and every reply
  can be stopped.

### Already built (reuse, don't rebuild)

- **Agent and models:**
  - Quick actions: `src/lib/quick-actions.ts`.
  - Model picker and effort.
- **Answers:**
  - Citations: `src/lib/sources.ts`.
  - Glossary of past answers: `src/lib/glossary.ts`.
  - Prior explanations: `src/lib/exchanges.ts`.
  - Explain preferences: `src/lib/explain-prefs.ts`.
- **Chats:**
  - Stop/cancel, and crash restart (`harness.rs`, "restart the adapter if it crashes").
  - Image questions.
  - Per-tab independent chats: `src/stores/tabs.ts`.

## 2. Harness: make it strong

| Item                             | What and why                                                                                                                                                                                                                                                                                                                                                              | Where                                                                                      | Effort                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| **Richer events**                | `parse_notification` only forwards `agent_message_chunk` text, turn end and permission requests. ACP also sends `agent_thought_chunk`, `tool_call` / `tool_call_update`, `plan` and usage. These are dropped today, so the UI can't show thinking, steps or sources. Add `AgentEvent` variants and forward them.                                                          | `agent/events.rs`, `agent/harness.rs` (`parse_notification`), fixtures in `agent/tests.rs` | S–M                   |
| **Yomu MCP server**              | Sessions start with `"mcpServers": []`, so library context is pushed into the prompt by keyword search (`libraryPassages` / `inventoryPassages` in `src/lib/db.ts`). Instead, expose read-only tools: `search_library`, `read_article(id, section)`, `list_collections`, `get_comments`. The agent then fetches only what it needs, and its answers cite real paragraphs. | New `agent/mcp.rs`; passed in `session/new` and `session/resume` (`harness.rs`)            | M                     |
| **Per-turn timeout**             | A turn with no event for ~60 s shows "The agent stopped responding", with Retry. Retry starts a fresh session. Today a stuck agent spins forever.                                                                                                                                                                                                                         | `chat-store.ts` / `library-chat-store.ts` `runTurn`, plus `harness.rs`                     | S                     |
| **Warm at launch**               | `warm()` exists. Call it at startup when an agent is chosen, so the first answer isn't slowed by the `npx` start. Add a light health check.                                                                                                                                                                                                                               | `app-shell.tsx` startup effect, `agent-store.ts`                                           | S                     |
| **Typed errors**                 | **Built.** The Rust side sorts errors (not signed in, usage limit, model not allowed, agent stopped, not installed, hung) and names the agent in use. The chat offers the matching fix: open setup, or "Use Auto and try again".                                                                                                                                          | `agent/errors.rs`, `components/chat/error-note.tsx`                                        | Done                  |
| **Sandbox on Linux and Windows** | **Linux: built and tested** (Landlock, same rules as macOS: `agent/confine.rs`). 12 tests pass in a real Linux container, including real Node under the rules; run them with `scripts/test-linux-sandbox.sh`. **Windows: designed, not built**: see `docs/windows-sandbox.md` (AppContainer).                                                                             | `agent/confine.rs`, `agent/harness.rs` (`confined`)                                        | Linux done, Windows L |
| **Context budget**               | **Built (simple form).** The chat tracks how full the model's memory is from its usage reports. At 85% the next turn moves to a fresh session that is given the article and recent conversation again; from 70% the chat says it is getting long.                                                                                                                         | `lib/agent-progress.ts`, chat stores, `components/chat/context-note.tsx`                   | Done                  |

## 3. UI: make answers easier to use

| Item                             | What and why                                                                                                                                                         | Where | Effort |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| **Thinking and steps**           | **Built.** One quiet line while the agent works, opening to its thinking and steps; it stays with the answer afterwards ("Used 2 tools").                            |
| **Free question on a selection** | **Built.** Select words, click Ask, type a question (or press Enter to explain). `components/reader/ask-box.tsx`.                                                    |
| **Ask in place**                 | **Not built.** Answers still appear in the chat panel. Margin cards beside the words need layout work alongside comments and must be checked in the running app.     |
| **Clickable sources**            | **Built.** `[Title](yomu:<id>#<paragraph>)` links open the blog at that paragraph; a Sources row lists blogs an answer mentions.                                     |
| **Message actions**              | **Partly built.** Copy and "Answer again" (last reply). Not built: edit and resend, pin, save an answer as a comment.                                                |
| **Slash commands**               | **Built.** `/summarize`, `/takeaways`, `/quiz` in the blog chat and `/recent`, `/topics`, `/disagree` in the global chat, with a pick-list. `lib/slash-commands.ts`. |
| **Status pill**                  | **Built (agent and state).** "Codex · Ready / Working… / Needs setup" in the chat header. The model is in the message box; quota is not shown.                       |

## 4. Features: new things the agent does

| Item                             | What and why                                                                                                                                                  | Where                                                  | Effort |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| **TL;DR plus section summaries** | A one-paragraph summary at the top of a blog, and a one-line summary per heading in the outline. Generated once and cached in a new table (**migration 11**). | `components/reader/outline.tsx`, `src-tauri/src/db.rs` | M      |
| **Quiz and flashcards**          | Questions from a blog or from your comments, with simple spaced review and a "5 cards to review" widget on Home. Reading turns into learning.                 | New `review` store + Home widget, migration            | M–L    |
| **Compare two blogs**            | Open two blogs in tabs, then "Compare": agreements, disagreements and which to trust for what.                                                                | Command palette, chat-store                            | M      |
| **Collection brief**             | "Summarise this collection", exported as Markdown with `src/lib/export-markdown.ts`.                                                                          | Sidebar collection menu                                | S–M    |
| **What should I read next**      | Ranks unread saved blogs by the questions you've been asking.                                                                                                 | Home                                                   | M      |
| **Glossary++**                   | Terms explained before get a dotted underline everywhere; hovering shows your earlier answer. Extends `glossary.ts`.                                          | `components/reader/glossary.tsx`                       | S–M    |
| **Background jobs**              | Long tasks (summarise a collection, build flashcards) run in a background tab with a notification when done. Tabs already isolate chats.                      | `src/stores/tabs.ts`, a small job queue                | M      |

## 5. Prioritised roadmap

**Phase 1: quick wins (S–M)**

1. Richer events, plus the thinking and steps UI.
2. Per-turn timeout, and warm at launch.
3. Free question on a selection.
4. Clickable sources.

**Phase 2: the big step (M)**

1. Yomu MCP server, so the agent reads the library itself.
2. Ask in place (margin answer cards).
3. Slash commands.
4. TL;DR plus section summaries in the outline.

**Phase 3: learning and reach (M–L)**

1. Quiz, flashcards and review.
2. Compare and collection brief.
3. Windows sandbox (Linux is done; see `docs/windows-sandbox.md`).

## 6. Risks and open questions

- **MCP support differs per adapter** (Codex, OpenCode, Claude Code). Read
  `agentCapabilities.mcpCapabilities` at `initialize`, and fall back to today's
  prompt stuffing when MCP is missing.
- **Quota.** Background jobs and auto summaries spend the user's plan.
  Generate them on demand or with an explicit toggle, never silently.
- **Migrations.** Only ever append (the next is 11). Applied migrations must
  never change, or the app fails to start.
- **Trust.** Richer events can include tool calls the agent wanted but was
  denied. Show them as "not allowed" and don't hide them.

## 7. How we'll know it worked

Local counters only, never sent anywhere:

- **Speed:** time to the first word of an answer.
- **Errors:** error rate per kind (not signed in, quota, timeout, …).
- **Sources:** share of library answers with at least one working citation.
- **Use:** how often the new actions are used (slash commands, ask in place,
  review).

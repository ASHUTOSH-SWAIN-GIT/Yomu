# Yomu: improvements and feature pitches

Written 2026-10-07 after a scan of the whole app (`src/`, `src-tauri/src/`, docs).
Effort: **S** = an afternoon, **M** = a few days, **L** = a week or more.

---

## 1. Fix first (broken or missing promises)

| #   | What                                                                                                                                                                                                                                                             | Why it matters                                                                                  | Where                                                                             | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| 1   | **"Ask about any line" has no button.** Selecting text only offers "Add comment". `explain()` and `askAbout()` in the chat store are not called from anywhere in the UI. **Fixed: the selection now offers Ask (with your own question), Add comment and Copy.** | It is the headline on Home ("Read anything. Ask about any line.") and the core idea of the app. | `stores/chat-store.ts:418`, `components/reader/comments.tsx` (`AddCommentButton`) | S      |
| 2   | **Old name in the command palette.** It still says "Customize Yomu"; the sidebar now says "Settings". **Fixed.**                                                                                                                                                 | Inconsistent wording.                                                                           | `components/layout/command-palette.tsx:142`                                       | S      |
| 3   | **Comments only work on text.** Images and code blocks cannot be commented on (dropped in the simple rebuild). **Fixed for pictures (a Comment button on each image). Code blocks use the same selection and should work; not checked in the running app.**      | Users will try it on diagrams.                                                                  | `comments.tsx`, `use-comment-selection.ts`                                        | M      |
| 4   | **Comments can overlap.** A short paragraph with several long comments runs into the next paragraph's comments. **Fixed: notes in the margin are nudged apart.**                                                                                                 | Looks broken on busy pages.                                                                     | `BlockComments` positioning                                                       | M      |
| 5   | **Tags have no UI.** The database still has tags, but the redesign removed the sidebar filter. **Not a gap: collections _are_ the tags, so the sidebar already is their UI.**                                                                                    | Dead data, or a missing feature. Decide: bring back or drop.                                    | `lib/db.ts`                                                                       | S      |
| 6   | **Saved highlights are never shown** in the reader (the `highlights` table is filled by explain). **Fixed: asked-about words get a thin underline, with the answer in a card beside them.**                                                                      | Past answers can't be found on the page.                                                        | `lib/db.ts`, reader                                                               | M      |
| 7   | **Sandbox gap.** `TODO(ROADMAP.md M4)`: no OS-level write/network limits on some agent setups. **Fixed: Linux sandbox built and tested; Windows is designed only (`docs/windows-sandbox.md`).**                                                                  | Trust and safety before strangers use it.                                                       | `src-tauri/src/agent/harness.rs:42`                                               | M      |
| 8   | **Setup dialog is orphaned.** "Set up Explain" was removed from the sidebar, so a new user with no agent gets no guidance until a chat fails. **Fixed: Home says so when no agent is connected.**                                                                | First run gets stuck silently.                                                                  | `setup-dialog.tsx`, Home                                                          | S      |

## 2. UX polish

- **Selection toolbar:** offer Ask · Comment · Copy · Highlight together, the way Notion and Medium do.
- **Outline:** highlight the section in the list while you scroll _in_ the list, keep the open list in view, and add keyboard ↑/↓ + Enter.
- **Reading progress:** a thin bar or "12 min left" in the top bar (progress is already saved per article).
- **Home after the first save:** show a "Continue reading" row, using the saved progress.
- **Empty states:** empty collection, no search results and no chats all show plain text. Use the welcome art there too.
- **Zoom:** show a small "110%" toast when it changes, and add zoom to Settings.
- **Image lightbox:** pinch or scroll to zoom and drag to pan inside the zoomed image (big diagrams are unreadable today).
- **Sidebar:** drag blogs between collections, and rename a collection by double-clicking.
- **Chat:** edit and resend a sent message, plus a "copy whole chat" action.
- **Keyboard:** a `?` sheet listing every shortcut (⌘K, ⌘., ⌘+/-, ...).
- **Theme:** follow the system light/dark schedule per theme pair (e.g. Catppuccin Latte ↔ Mocha).

## 3. Reliability and performance

- **First reply is slow:** the Codex adapter starts through `npx` on first use. Start it in the background at launch when an agent is chosen.
- **Image cache has no total limit**, only 80 images per article. Add a library-wide cap with least-recently-used cleanup in Settings → Storage.
- **Large images sent to the agent:** resize them before sending (over 5 MB is refused today).
- **Scraper:** no rules yet for Hashnode, Docusaurus tabs/callouts, Wikipedia infoboxes or Substack paywall teasers.
- **Very long articles:** `content-visibility` helps, but comments and highlights scan every block. Index ranges per block once.
- **Error reporting:** frontend `logError` never reaches the log file (only Rust logs do). Forward JS errors to the Rust logger.

## 4. Code health

- `index.css` is 1,400+ lines, mostly generated theme blocks. Move the generated part to `themes.css`.
- `home.tsx` (570 lines) mixes Home, the library list, Fetching and Welcome. Split it into files.
- `chat-store.ts` (635 lines) carries explain/highlight code that the UI no longer uses (see 1.1). Either wire it back or remove it.
- `ui-store.ts` has leftover fields from older designs (`notesInMargin`, `answerOpen`, `answerFocus`, `pastTitle`?). Remove whatever is unused.
- There are no tests for comments UI positioning, the outline or zoom shortcuts. Add a few component tests.

---

## 5. Feature pitches

Ranked by how much they make Yomu feel different from "a reader with a chatbot".

### Tier 1: makes the product

1. **Ask in place.** Select → Ask → the answer appears as a margin card next to the words (same style as comments), not only in the side chat. Follow-ups thread under the card. _This is the pitch on Home; build it first._ **M**
2. **Explain this diagram.** Click any image → "Explain". The agent already accepts images (ACP image blocks); the answer shows under the image. **S–M**
3. **Smart outline.** Next to each heading in the outline, show a one-line AI summary of that section, plus "TL;DR of this blog" at the top. Cached in SQLite, so it's generated once. **M**
4. **Daily review.** Turn comments and highlights into flashcards ("What does the Pageserver do?"), with spaced repetition and a small Home widget: "5 cards to review". Reading becomes learning. **M–L**

### Tier 2: makes people stay

5. **Read later inbox.** A browser extension or share-sheet target ("Send to Yomu") plus a `yomu://` deep link. Saving should take one click from anywhere. **M**
6. **RSS / follow a blog.** Follow a site and new posts appear in an Inbox. The Neon, Cloudflare and Stripe blogs all have feeds. **M**
7. **Ask your library.** The universal chat cites _which saved blogs_ an answer came from, with links that jump to the paragraph. FTS5 search is already there; add retrieval plus citations. **M**
8. **Collections as study guides.** One click: "Make a summary of everything in this collection". Exported as Markdown or PDF. **S–M**

### Tier 3: delight

9. **Listen mode.** Text-to-speech (macOS voices, offline) with the current sentence highlighted, for walks. **M**
10. **Glossary on hover.** Terms the agent explained before get a dotted underline everywhere; hovering shows your earlier answer. **M**
11. **Reading stats.** Minutes read, streak, and topics this month as a small, pretty Home card. **S**
12. **Share a page.** Export an article with your comments and answers as a clean HTML page or image card for Twitter/LinkedIn. **S–M**
13. **More agents.** Claude Code and OpenCode over ACP (the harness already supports custom commands; add presets). **S**
14. **Sync (optional).** Encrypted sync through iCloud Drive or a folder, keeping the local-first promise (ADR 0004). **L**

---

## Suggested order

1. Fix 1.1 (Ask button), 1.2, 1.8. These are small, and they make the demo match the pitch.
2. Pitch 1 (Ask in place) + pitch 2 (Explain diagram) for the showcase video.
3. Pitch 3 (Smart outline), since it builds on the outline you just added.
4. Then Tier 2, starting with the read-later inbox (growth) or Ask your library (depth).

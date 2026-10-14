# Yomu: feature ideas

Written 2026-10-13. Ideas only. Once we pick what to build, each one gets its own deep dive.

Filter: would a senior engineer reading docs, blogs and papers use this at work?

Already built, so not listed here: Ask in place, explaining images, library chat with citations, glossary on hover, Inbox (from bookmarks), Markdown export, Continue reading, shortcuts sheet.

---

## Decided

### 1. Follow blogs and docs (RSS)

- Follow a site (Neon, Cloudflare, Stripe, a docs changelog), and its new posts land in the Inbox.
- Half-built already: the `feeds` and `feed_items` tables exist (migration 10 in `src-tauri/src/db.rs`), but nothing uses them yet. The `articles.inbox` column (migration 9) is also in place.

---

## Candidates

### 2. Use your library from your editor's agent

- Yomu already runs an MCP server (`src-tauri/src/mcp.rs`) so the in-app agent can call `search_library`, `list_articles`, `read_article` and `get_comments`.
- Make it reachable from Claude Code, Codex or Cursor in your editor too.
- While coding, you could ask "what did I read about Postgres vacuum tuning?" and get your saved articles and notes back.
- Why: Yomu becomes a knowledge source for your coding work, not only a reader. Most of the plumbing exists.

### 3. Ask how an article applies to your code

- Point the agent at a local repo, read-only, and ask "how would this pattern apply to my codebase?"
- Trade-off: today's sandbox deliberately blocks the agent from the home folder. This needs an opt-in, read-only, per-folder grant.

### 4. Save from the terminal

- `yomu add <url>`, or a `yomu://` link that drops a URL into the Inbox.
- Why: developers live in the terminal, and right now saving only works through the app or the bookmarks folder.

### 5. Detect changed docs

- Docs pages change (new APIs, deprecations). Re-check saved pages and show a diff of what changed since you read them.
- Comments stay pinned to text that still exists.

### 6. Flag stale posts

- When you open an old post, the agent checks whether the APIs, flags or commands in it are deprecated now, and flags those parts.
- Why: technical blogs go stale fast.

### 7. Pull in a paper's references

- Click a citation in a paper and Yomu fetches that paper (arXiv or DOI) into Papers, linked back to where it was cited.
- It also keeps a list of the references you followed.

### 8. Save a whole docs guide

- Save a multi-page guide (the Rust book, a Kubernetes concept section) as one item with its table of contents, instead of page by page.
- Bounded: one guide, following its own navigation. The roadmap still keeps general bulk crawling out of scope.

### 9. Notes to an Obsidian folder

- Continuously write each article plus your comments and answers as Markdown into a folder you choose.
- Why: plenty of developers keep notes in Obsidian or a git repo, and today's export is manual, one article at a time.

### 10. Keyboard-first reading

- Vim-style keys: `j`/`k` to scroll, jump to the next or previous heading or code block, `y` to copy the code block under the cursor.

---

## Ranking

- **Build first:** 1 (RSS), then 2 (editor agent). That one makes Yomu fit how developers already work and costs little.
- **Next tier:** 5 (changed docs), 7 (references), 9 (notes folder).
- **Needs care:** 3 (repo access), because of the sandbox trade-off.

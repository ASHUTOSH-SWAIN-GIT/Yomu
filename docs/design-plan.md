# Yomu design pass: a quiet, typographic reader

> **Update:** this document now has two parts. **Redesign v2** (at the end) is the current plan and **supersedes Phases 3–6 below** and the "quiet, no cards, no gradients" direction. Phases 1–2 below are done and their infrastructure (theme-before-paint, reader preferences, contrast test, reader typography and controls) is kept.

## Context

Yomu works end to end (read, select, explain, chat, library, offline images) but it looks and feels like an unstyled shadcn starter. You said UI, UX and design are now the most important thing. Decisions made with you:

- **Direction:** quiet and typographic. The article is the star; one ink-indigo accent; no cards, no gradients.
- **Layout:** focus-first reader (article centred, library as slide-over and ⌘K, explanations in a drawer).
- **Reader controls:** typeface, text size and width, paper and dark themes, progress line and focus mode.
- **Polish:** app icon and wordmark, native macOS window, purposeful motion, welcome screen with a sample article.

## What is wrong today (from the code)

| Problem                                                                                                                                                                               | Where                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Fonts named (Inter, Source Serif 4, JetBrains Mono) but **never loaded**: everything renders in the system font. The serif is never used, so articles are set in the UI font at 15px. | `src/index.css`                                            |
| `@theme` font entries are self-referential (`--font-sans: var(--font-sans)`), so Tailwind font utilities may not resolve.                                                             | `src/index.css`                                            |
| Pure grey palette (zero chroma): no identity, and no accent for the one thing that matters (selection, Explain).                                                                      | `src/index.css`                                            |
| Type and spacing "scales" do not exist as tokens; reader uses ad hoc classes (`text-[15px] leading-7`).                                                                               | `src/components/reader/*`                                  |
| Fixed 256px sidebar and 320px chat leave ~224px for the article at the 800px minimum window.                                                                                          | `app-shell.tsx`, `library-sidebar.tsx`, `chat-panel.tsx`   |
| Chat is generic bubbles; meta lines are dot-joined strings; the empty state is a generic icon in a circle.                                                                            | `chat-panel.tsx`, `library-sidebar.tsx`, `reader-view.tsx` |
| App icon, favicon and tab icon are Tauri/Vite defaults; title bar is a plain OS frame plus a redundant in-app bar.                                                                    | `src-tauri/icons`, `index.html`, `tauri.conf.json`         |
| Theme applies after first paint (flash of light theme).                                                                                                                               | `src/hooks/use-theme.ts`                                   |

## Design system

**Subject and job:** a desktop reader for developers reading technical articles for long stretches, who occasionally ask an agent about a passage. The design's job is to make long reading comfortable and make "ask about this" feel like annotating a book, not opening a chat app.

**Memorable element (the one bold thing):** the annotation gesture. A passage you have asked about is marked with a hand-drawn-feeling **indigo ink underline** (not the usual yellow marker), and the answer is typeset in the drawer like a marginal note: the passage as a quoted epigraph, the answer in the reading serif, no bubbles. Everything else stays quiet.

### Colour (4–6 named values per theme; contrast checked in verification)

| Token                        | Light "Page"                      | Paper (opt-in) | Dark "Night"               |
| ---------------------------- | --------------------------------- | -------------- | -------------------------- |
| surface                      | `#FBFBFA`                         | `#EFEEE8`      | `#14161B`                  |
| ink (text)                   | `#1C1E25`                         | `#23221F`      | `#DADDE4`                  |
| quiet (secondary text)       | `#5F6470`                         | `#66645C`      | `#9299A6`                  |
| rule (hairlines)             | `#E6E7EA`                         | `#DDDBD2`      | `#262A33`                  |
| ai (accent, indigo dye)      | `#2F3E8F`                         | `#2F3E8F`      | `#9FAEF5`                  |
| ink-mark (explained passage) | ai at 14% fill + 2px ai underline | same           | ai at 22% fill + underline |

Neutrals are blue-tinted (not pure grey); dark is blue-black, not neutral black. Accent used only for: text selection, explained passages, links, the primary Explain action, focus rings, the progress line. Destructive stays red.

### Type (all open-licence variable fonts, self-hosted so the CSP stays strict)

| Role             | Face                                                         | Notes                                                                                                        |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Reading          | **Literata** (`@fontsource-variable/literata`)               | Designed for long on-screen reading; optical size axis. Also the answer text in the drawer and the wordmark. |
| Interface        | **Instrument Sans** (`@fontsource-variable/instrument-sans`) | Chosen over the default Inter. 13px chrome, 12px meta. Tabular numerals for progress.                        |
| Code             | **IBM Plex Mono** (`@fontsource/ibm-plex-mono`)              | Code blocks and commands only; never used for small data labels.                                             |
| Japanese accents | system Mincho/Mincho ProN                                    | The 読む lettering only; no font bundled.                                                                    |

Reading scale (ratio ≈ 1.2): body 18px/1.7 (serif gets extra leading), small 15px, h3 21px, h2 26px, h1/title 34px/1.15 with tight tracking. Measure **66ch** (adjustable 54/66/78ch, always under 80), left-aligned, ragged right, `hyphens: auto`. Sentence case everywhere; no all-caps labels, no eyebrows.

### Layout (focus-first)

```
Reading (default)                          Explaining (window >= 1180px, docked)
┌──────────────────────────────────────┐   ┌───────────────────────────┬──────────┐
│ ≡ 読 Yomu   Article title…   ⌘K Aa ◐ │   │ ≡ 読 Yomu   …    ⌘K Aa ◐ │ Explain  │
│▔▔▔▔▔▔▔ progress ▔▔▔▔                 │   │▔▔▔▔▔▔ progress            │ ┃ passage│
│                                      │   │                           │          │
│        Title (Literata 34)           │   │   Article column          │ answer   │
│        byline   saved   read 62%     │   │   shifts left, stays      │ typeset  │
│        Body 18/1.7, 66ch centred     │   │   ≥ 480px                 │ in serif │
│        ▓▓ explained passage ▓▓       │   │   ▓▓selected▓▓            │          │
│                                      │   │                           │ [ask…  ] │
└──────────────────────────────────────┘   └───────────────────────────┴──────────┘
Narrow window: drawer overlays the article edge instead of docking.
Library: slide-over from the left (≡) or ⌘K palette (search articles + chats, run actions).
Focus mode (⌘.): header and drawer hidden; header returns when the pointer touches the top edge.
Empty/first run: centred URL field, the sample article, and recent articles as a plain list.
```

Alignment: article and drawer text left-aligned; header controls grouped left (navigation) and right (view options). Sizes: header 44px; drawer 360–560px resizable (persisted); library sheet 320px.

### Motion (only where it explains a change)

Tokens: 120ms (small), 200ms (panels), 320ms (drawer); ease-out `cubic-bezier(.2,.7,.2,1)`. Used for: drawer slide with the article column shifting to keep the selection visible; library sheet; Explain control appearing at the selection; a short underline draw when a passage is saved; a soft caret at the end of streaming text (no per-token animation). No entrance animations on sections, no hover flourishes. `prefers-reduced-motion` sets all durations to ~0.

### Review of this plan against the generic-default tells (what I changed)

- Cream plus serif plus terracotta is the commonest generated look. Default theme is a cool near-white with an indigo accent; the cream tone exists only as the opt-in Paper theme you asked for, kept low-saturation.
- Chat bubbles and rounded cards read as a SaaS kit: replaced by a typeset transcript with a left rule for quoted passages. Library rows and recents are plain lists.
- Dot-joined meta strings ("Site · 2 days ago · 45%") are a tell: replaced by separate spans with spacing and a clear weight/colour hierarchy.
- Yellow marker highlight is the default: replaced by indigo ink underline.
- Monospace was a candidate for small labels: rejected; mono only for code and commands.

## Status

- **Phase 1 (foundation): done.** New tokens for Page, Paper and Night; Literata, Instrument Sans and IBM Plex Mono self-hosted and actually loaded (they never were before); font `@theme` fixed; type scale in em so it follows the reader's size; ink-underline marks for explained passages; theme applied before first paint (`public/theme-init.js`); reader preferences persisted and validated field by field.
- **Phase 2 (reader experience): done.** Article header without dot-joined meta, reading time, tags inline plus a "…" menu; "Aa" menu (typeface, size, width, theme, block remote images, focus mode); live progress line; focus mode (Cmd/Ctrl+. and Esc, exit control on top-edge hover); restyled blocks.
- **Phases 3–6: not started.** The library sidebar, chat panel and header are still the old layout, which is why the screenshots still show three columns and chat bubbles.
- **Checked by screenshot** (Chromium, mocked backend, in `~/code/yomu-screenshots/design-p2b-*`): reading in Page, Paper and Night, settings menu, explained passage, focus mode, sans/large/wide, 820px width. Two problems found and fixed from the first pass: hyphenation broke words mid-line (removed) and vertical spacing was too loose because `content-visibility` stops margins collapsing (blocks now own half-gaps).
- **Durable checks added:** `src/test/contrast.test.ts` reads the real tokens and checks WCAG contrast for all three themes (verified to fail on a deliberately bad colour); tests for appearance parsing, the ui-store, and reading time.

## Phases (each shippable on its own)

### Phase 1: Foundation (biggest visible win, lowest risk)

- `src/index.css`: rewrite tokens (keep shadcn token names so existing components keep working), fix the font `@theme` circularity, add type scale, reader variables (`--reader-font/size/measure`), motion tokens, `::selection`, `::highlight(yomu)` (indigo fill plus underline), reduced-motion rule.
- `src/main.tsx`: import the three font packages (npm deps `@fontsource-variable/literata`, `@fontsource-variable/instrument-sans`, `@fontsource/ibm-plex-mono`).
- `public/theme-init.js` plus `index.html`: apply theme and reader prefs before first paint (external file, because the CSP forbids inline scripts).
- `src/stores/ui-store.ts` and `src/hooks/use-theme.ts`: add `paper` theme; add reader prefs (typeface, size, measure) with the existing try/catch localStorage pattern.
- `src/components/reader/*` (paragraph, heading, list, quote, table, code, image): move to tokens and the new scale; Plex Mono for code (Shiki themes stay); figure captions styled.

### Phase 2: Reader experience

- New `src/components/reader/reader-settings.tsx` (the "Aa" popover: typeface, size, width, theme) using `@radix-ui/react-popover`.
- `reader-view.tsx`: article header redesign (title, byline, saved date and progress as separate spans), reading progress hairline (reuses the scroll logic in `src/hooks/use-reading-progress.ts`), focus mode, `article-tools.tsx` folded into a quieter "…" menu.
- Restyle the Explain control at the selection (`explain-button.tsx`) and the explained-passage marks.

### Phase 3: Shell and navigation _(superseded by Redesign v2)_

- `app-shell.tsx` rewritten for the focus-first layout; new `app-header.tsx` (drag region, traffic-light inset on macOS, progress line).
- `library-sidebar.tsx` becomes a slide-over sheet (reuse its list, search, tag and archive logic; `@radix-ui/react-dialog`).
- New `command-palette.tsx` with `cmdk`: search articles and chats (reuse `searchLibrary` in `src/lib/db.ts` and `useLibraryStore`), actions (open link from clipboard, toggle theme, focus mode, settings). Shortcuts: ⌘K palette, ⌘J drawer, ⌘. focus mode, Esc closes overlays.
- Welcome and empty states in `reader-view.tsx`; new `src/lib/sample-article.ts` (a short built-in article that explains the select, Explain, ask loop, saved as a normal article via `upsertArticle` so the agent works on it).

### Phase 4: Explain drawer _(superseded by Redesign v2)_

- `chat-panel.tsx` becomes the drawer: transcript layout (quoted passage epigraph, serif answer, no bubbles), streaming caret, composer at the bottom, resize handle, docked or overlay by window width, remembered width. Reuse `markdown.tsx`, `setup-checklist.tsx`, and all `chat-store.ts` logic unchanged.

### Phase 5: Identity and native feel _(superseded by Redesign v2)_

- Mark: a page with two lines of text where the second is underlined in indigo (the annotation gesture), plus a Literata "Yomu" wordmark with small 読む. Source SVG in `src-tauri/icons/source/`, rendered to a 1024px PNG with `qlmanage`/`sips`, then `npx tauri icon` regenerates all icon sizes, `.icns` and `.ico`. New `public/favicon.svg` replaces `vite.svg`; `src/components/brand/wordmark.tsx` for the header.
- `src-tauri/tauri.conf.json`: `titleBarStyle: "Overlay"`, `hiddenTitle`, `trafficLightPosition` (macOS only; other platforms keep the normal frame). `capabilities/default.json`: allow window dragging and double-click maximise for the header drag region.

### Phase 6: Quality pass _(superseded by Redesign v2)_

- Screenshots of every key state in Page, Paper and Night (see verification), a durable contrast test, keyboard-only walkthrough, reduced-motion check, docs update.

## Reuse, do not rebuild

`use-reading-progress.ts`, `use-highlights.ts` (only its CSS changes), `use-text-selection.ts`, `chat-store.ts`, `library-store.ts` (search, tags, archive), `image-store.ts`, `markdown.tsx`, `setup-checklist.tsx`, `export-markdown.ts`, `searchLibrary`/`toMatchQuery`, the existing `Button` variants (restyled through tokens, not rewritten).

## Verification

1. **Contrast test (new, durable):** `src/test/contrast.test.ts` reads the tokens from `index.css` and asserts text pairs >= 4.5:1 and control borders/focus rings >= 3:1 for all three themes (replaces my throwaway script).
2. **Unit tests:** ui-store prefs persist and fall back safely; sample article opens and is explainable; palette result ordering; theme-init handles missing storage.
3. **Checks:** `npm run lint && npm run typecheck && npm test && npm run build`; `cargo fmt --check && cargo clippy -- -D warnings && cargo test`; `npm run format:check` (including `capabilities/default.json`, which broke CI before).
4. **Visual review:** run the Vite app with a small mocked Tauri backend and capture screenshots with Playwright into `~/code/yomu-screenshots/` (outside the project, per your rule): reading, explaining docked and overlay, library sheet, palette, welcome, focus mode, settings popover, each in Page/Paper/Night at 800px and 1400px widths. I review them against this plan and iterate before calling a phase done. I cannot capture the real native window here, so **the macOS overlay title bar and app icon need your eyes in `npm run tauri dev`**; the icon PNG I can inspect directly.
5. **Manual (you):** tab through everything with the keyboard, toggle reduced motion in System Settings, drag the window by the header, resize the drawer, reopen after restart to confirm preferences persist.

## Risks and open points

- The overlay title bar and `trafficLightPosition` are macOS only and unverified until run natively; header padding must not break on Windows/Linux.
- The Custom Highlight API only supports a few CSS properties (`background-color`, `text-decoration`, `color`); the underline plan stays within them, and older webviews simply fall back to no marks (already the behaviour).
- Fonts add roughly 300–500KB to the bundle (latin subsets load on demand); acceptable for a desktop app.
- This is a large change. Suggested order for the first implementation pass: Phase 1 and Phase 2 together (most visible gain), then review screenshots with you before starting the shell rewrite in Phase 3.

---

# Redesign v2: from template to a product with a point of view (current plan)

## Context

Phases 1–2 of the earlier design plan restyled the article view (fonts, tokens, reader controls). You have now told me the app as a whole is still bad, for four reasons: it **looks generic**, the **layout and navigation** are wrong, the **Explain panel** is poor, and it is **too plain and boring**. Your reference apps are **Linear/Raycast** (fast, sharp, command-first) and **Arc/Notion/Craft** (bold colour, soft depth, playful).

That conflicts with the earlier brief ("quiet, no cards, no gradients, one accent"), which was too timid. This plan replaces that direction. It has two steps: (1) **explore three different directions as real screens and let you choose**, (2) **build the chosen one across the whole app**. On approval, the first action is to append this plan to `docs/design-plan.md` and add an M7 design milestone to `ROADMAP.md` (the roadmap currently has no design milestone, and its principle "restrained UI, no gradients" is being retired).

## Why it feels bad (diagnosis, from the code and screenshots)

| Complaint             | Concrete cause                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generic               | shadcn defaults everywhere: one radius on everything, flat `muted` panels, an outlined search box, a tabs control, plain list rows, a default `Button`. Nothing signature. The brand is a word in a header. App and tab icons are Tauri/Vite defaults. |
| Boring                | Almost no colour outside one accent used sparingly; no depth, texture or imagery; empty states are an icon in a circle; no motion beyond a spinner and one pop-in.                                                                                     |
| Layout and navigation | Three fixed columns (256px + article + 320px) that squeeze the article; the library is always on screen but rarely needed; no command palette, no quick switching, no sense of "where am I"; header has one tiny menu.                                 |
| Explain panel         | The product's core feature is a narrow side chat with generic bubbles, disconnected from the passage it is about, hidden until first use.                                                                                                              |

## Design brief v2 (what changes)

- **Personality over restraint.** Colour, depth and a signature idea are allowed and expected. The article body stays calm and highly readable (Literata reading type was the one thing that worked), but the _chrome, navigation and Explain experience_ become distinctive.
- **Command-first and fast (Linear/Raycast):** ⌘K is the primary way to move; everything has a shortcut; crisp 1px detail; no dead clicks.
- **Warm, spatial, a little playful (Arc/Notion/Craft):** soft depth, confident colour, rounded shapes where they mean something, delightful micro-interactions.
- **Explain is the hero.** It should feel tied to the passage, not like a chat app bolted on.
- Keep from before: `prefers-reduced-motion`, WCAG contrast (extend `src/test/contrast.test.ts`), theme-before-paint, reader preferences, focus mode, keyboard access.
- Webview reality (WKWebView / WebView2 / WebKitGTK): gradients, `color-mix`, `backdrop-filter` are fine on macOS/Windows; keep progressive enhancement for older WebKitGTK.

## Step 1: three directions to choose from

Each is a full-app concept with its own layout, palette, type and Explain model, chosen to be distinct from each other and to avoid the generated-design tells (cream + terracotta, near-black + acid accent, broadsheet hairlines, identical rounded cards, ALL-CAPS eyebrows).

### A. "Signal" (Linear/Raycast lineage): command-first, sharp

- **Idea:** a precise instrument. Slim icon rail, ⌘K everywhere, a reading _ruler_ on the article's left edge: headings appear as ticks that double as table of contents and progress; hover to preview, click to jump.
- **Palette:** frame `#EEF0F4`, sheet `#FFFFFF`, ink `#12141A`, quiet `#5B6272`, accent ultramarine `#3D5AFE`, annotation amber `#FFC53D`. Night: `#0E1015` / `#151821` / `#E8EAF0`, accent `#7C93FF`, amber `#FFD166`.
- **Type:** Geist (interface), Literata (reading), Geist Mono only for real keycaps.
- **Explain:** right **inspector** panel with sections (Answer, Passage, Ask); passages you asked about are amber-marked and connected to their answer by a hover line.
- **Signature:** the reading ruler + keycap hints on every action.

```
┌──┬───────────────────────────────────────────────┬─────────────────┐
│▣ │ ⌘K Search or run a command…            Aa  ◐  │ Inspector       │
│⌂ │ ┌─┐                                           │ ───────────     │
│☆ │ │▏│ Understanding Ownership                   │ Passage ▸       │
│⚙ │ │▏│ Ada · 2 min                               │ "Each value…"   │
│  │ │▎│ body text …                               │ Answer          │
│  │ │▏│ ▓▓ amber marked passage ▓▓                │ streamed text   │
│  │ └─┘ ruler                                     │ [Ask ⌘↵]        │
└──┴───────────────────────────────────────────────┴─────────────────┘
```

### B. "Studio" (Arc/Notion/Craft lineage): soft, spatial, colourful

- **Idea:** a desk. A tinted canvas with floating rounded sheets (article, library dock, explanation). Every article gets its own hue and a small generative **cover** (from its title/site), used for its header band, library thumbnail and Explain accents, so the library is instantly scannable and alive.
- **Palette:** sea-glass canvas `#E6F0EE`, sheet `#FBFEFD`, ink `#10262B`, quiet `#5A7379`, primary deep teal `#0B7A75`, coral pop `#FF7A59` for annotations. Night: `#0F1B1E` canvas.
- **Type:** Bricolage Grotesque (headings and brand), Figtree (interface), Literata (reading).
- **Explain:** a **floating card anchored beside the passage**, stackable (several notes can be open), with soft depth; a small dock lists all notes for the article.
- **Signature:** per-article colour and covers; soft, physical motion.

```
canvas (tinted)
   ┌─ dock ─┐   ┌───────────────────────────────┐
   │ ◉ ◉ ◉  │   │ ▬▬ cover band (article hue) ▬▬ │  ┌── note ─────┐
   │ recent │   │ Understanding Ownership       │──▶│ Each value… │
   │ ◉ ◉    │   │ body …  ▓▓passage▓▓           │  │ answer…      │
   └────────┘   └───────────────────────────────┘  └─────────────┘
```

### C. "Spaces" (blend): Arc-style organisation with a Raycast-style Ask bar

- **Idea:** two big product ideas. **Spaces**: your tags become coloured spaces in a slim sidebar, with **open articles as tabs** (read several things at once). **The Ask bar**: instead of a chat panel, a Raycast-style command bar rises at the bottom centre when you select text; type a question or pick a quick action; the answer streams into a sheet above it.
- **Palette:** clean white and ink `#14151A`, a set of eight saturated space colours, neutral black primary (Notion-like), a dark glass Ask bar.
- **Type:** Hanken Grotesk (interface), Fraunces used sparingly for space titles, Literata (reading).
- **Explain:** Ask bar plus a transient answer sheet; history lives with the article, not in a permanent panel.
- **Signature:** the Ask bar and coloured spaces with tabs.

```
┌────────┬──────────────────────────────────────────────┐
│ ● Rust │ [Ownership ✕][Tokio ✕][+]                    │
│ ● Web  │                                              │
│ ● AI   │   Article, centred                           │
│ ────── │   ▓▓ selected passage ▓▓                     │
│ + Space│      ┌───────────────────────────────┐       │
│        │      │ Ask about this…      ⌘↵  ✦ ⚡ │       │
└────────┴──────┴───────────────────────────────┴───────┘
```

### How the exploration is produced (no app code touched)

- Static HTML/CSS prototypes, one folder per direction, using the real sample article, real fonts from `node_modules/@fontsource*`, and the same mocked data as `shots.mjs`. Saved in `~/code/yomu-design-explorations/{signal,studio,spaces}/` (outside the project).
- Four screens each, Page and Night: **Reading**, **Explaining** (with an answer), **Navigation** (library plus ⌘K open), **Welcome/first run**.
- Rendered with Playwright at 1440×900 @2x into `~/code/yomu-screenshots/directions/`, plus a single `index.html` gallery you can open to compare side by side.
- I run the anti-template review on each before showing you, and revise any part that reads like a default.
- **You choose** A, B, C or a mix ("A's layout with B's colour"). Nothing else is built until then.

## Step 2: build the chosen direction (direction-agnostic modules)

Order matters: each module leaves the app working and shippable.

1. **Design system v2.** Tokens, fonts, radii, elevation, motion for the chosen direction (replaces the palette in `src/index.css`; keeps `public/theme-init.js`, `src/lib/appearance.ts`, `ui-store.ts` prefs, reader variables, and the contrast test extended to the new tokens). Restyle primitives: `button`, `popover`, `segmented`; add `dialog/sheet`, `tooltip`, keycap.
2. **Shell and navigation.** New layout for the chosen direction, `cmdk` command palette (search articles and chats via `searchLibrary`, actions, recent), library as rail/dock/spaces, shortcuts (⌘K, ⌘J, ⌘., Esc). Reuses `library-store.ts` (search, tags, archive) and `use-reading-progress.ts`.
3. **Reader.** Keep Phase 2 typography and controls; add the direction's signature (ruler / cover band / tabs) and restyle header, blocks, Explain control.
4. **Explain experience.** Inspector, floating notes, or Ask bar per direction. Reuses `chat-store.ts`, `markdown.tsx`, `setup-checklist.tsx`, `use-highlights.ts` (mark style changes to the direction's annotation colour), all agent logic unchanged.
5. **First run and empty states.** Welcome screen with a built-in sample article (`src/lib/sample-article.ts`, saved as a normal article), recents, setup checklist redesigned; friendly error and empty copy.
6. **Identity.** App icon, wordmark, favicon (SVG rendered to 1024px PNG with `qlmanage`/`sips`, then `npx tauri icon`), macOS overlay title bar with traffic-light inset and drag region (`tauri.conf.json`, `capabilities/default.json`).
7. **Motion and delight.** Only meaningful transitions (panels, marks, answer arrival), micro-interactions on the signature element, `prefers-reduced-motion` honoured.
8. **Quality pass.** Full-app screenshots in every theme and width, contrast test, keyboard-only walkthrough, docs.

What is thrown away: the Phase 2 header/`Aa` chrome styling and the current `library-sidebar.tsx`/`chat-panel.tsx` layouts. What stays: all data, stores, search, offline images, agent, settings behaviour, focus mode, tests.

## Documentation changes (first thing after approval)

- Append this plan to `docs/design-plan.md` under "Redesign v2", marking the earlier phases 3–6 superseded, and update its status.
- `ROADMAP.md`: replace the principle "restrained UI, no gradients" with the v2 brief, and add **M7: Design v2** with the eight modules as checkboxes plus the exploration/decision step (Phases 1–2 of the old plan recorded as done).

## Verification

1. **Exploration:** 12 screenshots (3 directions × 4 screens) plus the gallery reviewed by you; my written anti-template critique per direction.
2. **After choosing:** the existing screenshot harness (`shots.mjs`, mocked backend) extended to library, palette, welcome, explain, focus, narrow and wide widths, in Page and Night, saved to `~/code/yomu-screenshots/` and reviewed against the chosen prototype before each module is called done.
3. **Automated:** `npm run lint && npm run typecheck && npm test && npm run build`, `npm run format:check`, cargo fmt/clippy/test for the window and icon changes; contrast test covers the new palette in all themes; tests for palette result ordering, shortcuts, new-tab/space logic if chosen, first-run sample article.
4. **You verify natively:** the macOS title bar and app icon (I can't capture the real window), motion feel, and a keyboard-only pass.

## Risks and open points

- **Taste risk** is the main one, which is why exploration comes first.
- Bold visuals must not hurt reading: the article surface stays calm in all three directions.
- Direction C adds real features (tabs, spaces) beyond visuals; if chosen, tabs become a scoped feature with their own state and tests, and I would confirm scope before building.
- Per-article generative covers (B) and the reading ruler (A) need small new components and tests.
- Fonts add weight to the bundle (latin subsets load on demand); acceptable for a desktop app.

## Redesign v2 status

- [x] Plan written and approved.
- [x] Step 1: three direction explorations (Signal, Studio, Spaces): 4 screens each in Page and Night (24 screenshots), plus a gallery. Prototypes live outside the project in `~/code/yomu-design-explorations/`, screenshots in `~/code/yomu-screenshots/directions/`. **Chosen: C, Spaces**, with a rule added after review: **one colour per page**. Only the active space's colour appears (its dot, tab edge, annotation marks and strings in code); other spaces, tiles, links, buttons and code are neutral. Refined version is direction `spaces2` in the gallery.
- [x] Choose a direction: Spaces (C), one-colour-per-page refinement.
- [x] Step 2 built (see ROADMAP M7): design system v2, spaces sidebar and tabs, command palette, reader, Ask bar and answer sheet, welcome page and tour article, icon and macOS title bar, motion.
- [ ] Remaining: your check of the native macOS window and icon; keyboard-only and screen reader walkthroughs; a first pass of real use to tune spacing.

**Implementation notes (Step 2)**

- One colour per page: `--space` follows the open article's space (`hooks/use-space-accent.ts`); other spaces, links, buttons and code are neutral.
- Spaces are tags with a stable colour slot per space (`lib/spaces.ts`, `stores/spaces-store.ts`); tabs are `stores/tabs-store.ts` (stops an answer mid-stream before switching so no text is lost).
- The Ask bar keeps the selection in `stores/selection-store.ts` because clicking into it collapses the browser's own selection.
- Removed: the old library sidebar, chat panel, floating Explain button, theme and image toggles (now in the Aa menu and palette).

---

## Redesign v3: margin notes (current, supersedes v2)

- **Palette:** pure `#000` and white, greys between, red only for errors. Dark only for now; the theme code stays for a later option.
- **Type:** Hanken Grotesk for the interface at 12–13px, Literata for reading at 17px. No display face.
- **Layout:** no sidebar, no tab strip. One thin top bar (Library, article title, Search, Aa). The library is the home page: paste a link, then a quiet index filtered by space, with archive and delete on hover.
- **The one bold idea:** answers are written in the margin beside the passage they explain, numbered in reading order like notes in a book (`components/reader/margin-notes.tsx`). Below 1040px of reading width they fall back to the sheet above the Ask bar.
- **Selection** turns text black on white (reversed print).

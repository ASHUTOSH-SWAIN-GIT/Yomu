# PDF support: reading research papers in Yomu

Written 2026-10-11. **Status:** phase 1 built (import, parsing, reader, entry points). Phases 2 and 3 are planned. Effort: **S** = an afternoon,
**M** = a few days, **L** = a week or more.

## 1. Goal and decisions

Read research papers next to blogs. The user picks a PDF **from their
computer** (nothing is fetched from the web), and it opens as a normal Yomu
article, so everything that exists keeps working: outline, comments, Ask and
Explain, chat, library search, the MCP tools, tabs.

| Decision          | Choice                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **View**          | **Reflowed text**: the PDF becomes Yomu's article blocks (headings, paragraphs, lists, images). Real page view is not part of this plan.                                                                                              |
| **Parser**        | **pdf.js** (`pdfjs-dist`, exact pinned version) in the frontend. It gives every piece of text with position, size and font, and it can draw a page to an image, which is how figures, tables and equations survive. Loaded on demand. |
| **Why not Rust**  | `pdf-extract` gives text only and cannot draw pages. Equations and figures would be lost.                                                                                                                                             |
| **No migration**  | Identity is `canonical_url = "pdf:<sha256 of the file>"`, `url = "file://<path>"`, `site = "PDF"`. The same file imported twice opens the saved copy. The next migration number stays free.                                           |
| **Original file** | Copied to `$APPDATA/pdfs/<sha>.pdf`, so a paper can be re-imported when the parser improves and opened in the system viewer.                                                                                                          |
| **Scanned PDFs**  | No selectable text gives a clear error ("This PDF has no selectable text (scanned)"). OCR is out of scope.                                                                                                                            |

## 2. Parsing pipeline

Pure functions in `src/lib/pdf/`, each tested on synthetic input.

| Step                     | What it does                                                                                                                                                                                                                                                                                                                                                                                        | File         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Load**                 | Opens the bytes with pdf.js (worker bundled by Vite, `isEvalSupported: false`, fonts and cmaps from `public/pdfjs`). Collects each page's text items with x, y, size and real font name. Reports progress per page.                                                                                                                                                                                 | `load.ts`    |
| **Lines**                | Groups items into lines by baseline, and puts spaces where the gap is wider than a space.                                                                                                                                                                                                                                                                                                           | `lines.ts`   |
| **Reading order**        | Splits each page into bands, full width (title, abstract, wide figures) or two-column (a gutter near the middle that no line crosses). Reads left column, then right.                                                                                                                                                                                                                               | `layout.ts`  |
| **Clean up**             | Drops running heads, footers and page numbers (same line position on most pages). Moves footnotes to a "Notes" section at the end.                                                                                                                                                                                                                                                                  | `clean.ts`   |
| **Blocks**               | Lines to the existing `Block[]` (`src/types/article.ts`, no new block type): paragraphs (gap or indent), hyphen joins, bold and italic spans, headings (numbering depth, then font size), lists, a References list.                                                                                                                                                                                 | `blocks.ts`  |
| **Metadata**             | Title (PDF info if it looks real, else the biggest text on page 1), authors (before "Abstract"), date (creation date to `publishedAt`).                                                                                                                                                                                                                                                             | `meta.ts`    |
| **Figures and the like** | Finds figures (image operators, plus the area above a "Figure N:" caption), tables (a "Table N:" caption and the dense aligned cells below) and display equations (centred lines in math fonts). Each is cropped from the page drawn at 2x and becomes an `image` block whose `alt` is its extracted text, so search and the agent still see something. The caption follows as an italic paragraph. | `regions.ts` |

## 3. Rust (`src-tauri/src/pdf.rs`, small)

| Command                       | What                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import_pdf(path)`            | Checks the `%PDF-` header and a size cap (about 200 MB), hashes the file, copies it once to `$APPDATA/pdfs`. Returns the hash.                     |
| `read_pdf(sha)`               | Returns the bytes as a raw binary response (no CSP change).                                                                                        |
| `save_pdf_image(sha, n, png)` | Writes the crop to the images folder. The frontend records it with `saveArticleImages` (`src/lib/db.ts`), so `image-block.tsx` shows it unchanged. |

- **Agent image questions:** `imgcache::load_for_agent` (`src-tauri/src/imgcache.rs`) accepts only web images today; extend it to read a cached local file, so "Ask about this figure" works.
- **Capability:** add `dialog:allow-open` to `src-tauri/capabilities/default.json`; register the commands in `lib.rs`.
- **Deleting a paper:** removes its PDF and crops when nothing else uses them.

## 4. Frontend

- **Store (`src/stores/reader-store.ts`):**
  - **`openPdf(path)`:** `import_pdf`, then open the saved copy if `pdf:<sha>` exists. Otherwise `read_pdf`, parse, save crops, `upsertArticle`, file in the default collection, refresh the library (same flow as `openUrl`).
  - **Re-import:** `rescrape` re-parses the stored PDF when the article is a PDF.
- **Entry points:**
  - **Home:** an "Open PDF" button beside the URL box (`src/components/layout/home.tsx`).
  - **Shortcut:** `⌘O`, listed in the shortcuts list.
  - **Palette:** "Open PDF…" in the command palette.
  - **Drag and drop:** a `.pdf` dropped on the window (`app-shell.tsx`).
- **Loading:** the existing `Fetching` component shows "Reading page 7 of 31…", with cancel.
- **Reader header:** "PDF · 31 pages · 45 min read", "Open original" (opener plugin) in place of "Open in browser", and "Re-import".
- **Library list:** a PDF icon instead of a site favicon.
- **Long papers:** `content-visibility: auto` on blocks (no virtual list needed for about 600 blocks), and muted "p. 4" markers in the margin so a place can be found in the original.

## 5. Agent fit

- **Explain and Ask on a passage:** works as is (`buildPrompt`, nearby blocks).
- **Whole-paper prompts:** `buildArticlePrompt` cuts at 30k characters and papers run 60k to 100k. For a PDF, send the abstract, introduction, conclusion and the headings list, and tell the agent to use `read_article(id, section)` (already in `src-tauri/src/mcp.rs`) for the rest.
- **Later:** `/methods`, `/limitations`, `/explain-figure` slash commands (`src/lib/slash-commands.ts`).

## 6. Built so far (phase 1)

- **A page of its own:** a "Papers" item in the sidebar opens `papers-page.tsx` (open button, drop hint, progress, the list of papers). PDFs do not appear in Home's list; they are in Papers and in collections.
- **Rust:** `src-tauri/src/pdf.rs` (`import_pdf`, `read_pdf`, `prune_pdfs`, `open_pdf_original`), 5 tests.
- **Parser:** `src/lib/pdf/` (`load`, `lines`, `layout`, `clean`, `blocks`, `parse`, `identity`, `import`, `pick`), 15 tests, including real PDFs generated with `pdf-lib` and read with pdf.js.
- **Checked on a real paper** ("Attention Is All You Need", 15 pages, about 0.3 s): title, section and subsection headings, two-column order, hyphen joins, a bulleted list, the references list and footnotes come out right.
- **Not yet right:** display equations, tables and figure text come out as loose text or as headings (phase 2 turns them into images). Authors are only taken when they are plain lines of names.
- **Differences from the plan:** no bundled font or cmap files yet (not needed for text); page markers wait for phase 2; "Open original" opens Yomu's saved copy in the system PDF viewer.
- **To check in the real app:** the pdf.js worker loads under the CSP (the `.mjs` file is served as JavaScript, so it should), and the file dialog, drag and drop and `⌘O`. Image decoders need `'wasm-unsafe-eval'` in the CSP; add it with phase 2 when pages are drawn.

## 7. Phases

| Phase                             | Contents                                                                                                                                   | Effort |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **1. Import and text**            | Rust commands, pdf.js loading, lines, order, clean-up, blocks, metadata, entry points, header, library icon, re-import, scanned-PDF error. | M–L    |
| **2. Figures, tables, equations** | Region crops, page markers, local image questions to the agent, `content-visibility`.                                                      | M      |
| **3. Paper extras**               | Citation markers `[12]` that show the reference on hover, PDF link annotations as links, long-paper prompts, paper slash commands.         | M      |

## 8. Risks

- **Layout guesses fail:** unusual layouts (three columns, sidebars, rotated tables) will come out wrong. Keep "Open original" one click away and make re-import cheap.
- **Equations:** an image is faithful but not selectable; the `alt` text is rough. Real LaTeX recovery is out of scope.
- **pdf.js size and speed:** about 1 MB of code and a worker; loaded only when a PDF is opened. Parse on the worker, with progress, never on the UI thread.
- **Webview limits:** the worker and font files must load under the CSP (`worker-src` may need `'self' blob:`). Verify in the real app first.
- **Big files:** the size cap and per-page progress keep a 500-page book from freezing the app.

## 9. How to verify

- **Unit tests:** synthetic text items for order, headers and footers, hyphen joins, paragraphs, headings, references and title; small PDFs generated in the test (`pdf-lib`, dev dependency) for the real parse.
- **Rust:** `import_pdf` (hash, copy once, rejects non-PDFs and oversize), `read_pdf`, `save_pdf_image`; clippy `-D warnings` and the Windows compile check in CI.
- **Real app (not the browser):** a two-column paper (Attention Is All You Need), a single-column arXiv paper, a 100+ page thesis, a scanned PDF, the same file twice. Check order, outline, figures, equations, comments, Ask and chat.
- **Speed:** a 30-page paper imports in a few seconds with visible progress.

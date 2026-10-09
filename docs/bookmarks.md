# Bookmarks to Yomu

Bookmark a page into a folder named **Yomu** in Chrome, Brave or Helium and it
is in Yomu's **Inbox** the next time the app is open (or within a minute if it
already is).

## How it works

- **No extension.** Chromium browsers keep bookmarks in a plain `Bookmarks`
  file in each profile folder. Yomu reads those files itself
  (`src-tauri/src/bookmarks.rs`), so it works whether or not Yomu was running
  when the page was bookmarked. Browser sync fills the same file, so a page
  bookmarked on a phone arrives too.
- **Only the Yomu folder.** Links inside a folder with that name (any depth,
  any case, folders within it included) are used. Nothing else in the file is
  kept. Only `http` and `https` pages count.
- **Where.** macOS: `~/Library/Application Support/{Google/Chrome,
BraveSoftware/Brave-Browser, net.imput.helium}`. Windows and Linux: Chrome and
  Brave only. Every profile is read.
- **When.** At startup, every minute, and when the window is brought back to
  the front (`watchBookmarks` in `src/stores/bookmarks-store.ts`).
- **Saving.** Each new page is fetched and cleaned like a pasted link, saved,
  and put in the Inbox, in no collection. It stays there (and out of Home's
  list) until the reader adds it to a collection, which takes it out of the
  Inbox. Opening it does not. A page that is already in the library is not put
  in the Inbox. Up to 20 pages are saved per pass; a big folder is spread over
  the next passes.
- **Remembering.** Table `bookmark_imports` (migration 11) records each page
  tried: `saved`, or `failed` with its tries. A failed page is retried until it
  has had 3 tries.
- **Switch.** Settings → Bookmarks. Removing a bookmark never deletes the saved
  page.

## Not covered

- Safari (its bookmarks are protected by macOS), and Firefox (a different
  format).
- Pages behind a login: Yomu fetches them as a logged-out visitor, like any
  pasted link.
- A browser the list in `browser_dirs()` does not know.

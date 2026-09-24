# 4. Local first, no backend server in v1

**Status**: accepted

- Scraping, storage (SQLite) and agent calls all run on the user's machine.
- No API keys and no app-side model calls: the user's own Codex login is used, and Yomu never reads or forwards its token.
- Logs (`tauri-plugin-log`) are written to the OS app log directory only and never leave the machine.

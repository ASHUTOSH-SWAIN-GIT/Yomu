use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:yomu.db";

/// Schema from ROADMAP.md M3. `highlights`, `chats`, and `messages` aren't
/// read or written yet (that's M5), but the tables are created now so the
/// migration history doesn't need to be revisited later.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create articles, highlights, chats, messages",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE articles (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                canonical_url TEXT UNIQUE NOT NULL,
                title TEXT,
                author TEXT,
                site TEXT,
                blocks_json TEXT NOT NULL,
                scraped_at INTEGER NOT NULL,
                saved INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE highlights (
                id TEXT PRIMARY KEY,
                article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                block_index INTEGER NOT NULL,
                start_offset INTEGER NOT NULL,
                end_offset INTEGER NOT NULL,
                text TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE chats (
                id TEXT PRIMARY KEY,
                article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                agent TEXT NOT NULL,
                acp_session_id TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                highlight_id TEXT REFERENCES highlights(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX idx_highlights_article ON highlights(article_id);
            CREATE INDEX idx_chats_article ON chats(article_id);
            CREATE INDEX idx_messages_chat ON messages(chat_id);
        "#,
    }]
}

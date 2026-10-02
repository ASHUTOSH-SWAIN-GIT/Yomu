use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:yomu.db";

/// Schema from ROADMAP.md M3. `highlights`, `chats`, and `messages` aren't
/// read or written yet (that's M5), but the tables are created now so the
/// migration history doesn't need to be revisited later.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
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
        },
        Migration {
            version: 2,
            description: "search index, reading progress, archive, tags",
            kind: MigrationKind::Up,
            sql: MIGRATION_2,
        },
        Migration {
            version: 3,
            description: "offline image cache index",
            kind: MigrationKind::Up,
            sql: MIGRATION_3,
        },
        Migration {
            version: 4,
            description: "article published date",
            kind: MigrationKind::Up,
            sql: MIGRATION_4,
        },
        Migration {
            version: 5,
            description: "message scope",
            kind: MigrationKind::Up,
            sql: MIGRATION_5,
        },
    ]
}

/// Full-text search over article text and chat messages (`search_index`),
/// kept in sync by triggers so no app code has to remember to update it.
/// `articles.text_content` is plain text written by the app (see
/// `src/lib/db.ts`); rows saved before this migration are backfilled there.
pub const MIGRATION_2: &str = r#"
    ALTER TABLE articles ADD COLUMN text_content TEXT;
    ALTER TABLE articles ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE articles ADD COLUMN progress REAL NOT NULL DEFAULT 0;

    CREATE TABLE article_tags (
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (article_id, tag)
    );
    CREATE INDEX idx_article_tags_tag ON article_tags(tag);

    CREATE VIRTUAL TABLE search_index USING fts5(
        article_id UNINDEXED,
        kind UNINDEXED,
        ref_id UNINDEXED,
        text,
        tokenize = 'porter unicode61'
    );

    CREATE TRIGGER articles_search_ai AFTER INSERT ON articles
    WHEN new.text_content IS NOT NULL BEGIN
        INSERT INTO search_index (article_id, kind, ref_id, text)
        VALUES (new.id, 'article', new.id, coalesce(new.title, '') || char(10) || new.text_content);
    END;

    CREATE TRIGGER articles_search_au AFTER UPDATE OF title, text_content ON articles BEGIN
        DELETE FROM search_index WHERE kind = 'article' AND ref_id = old.id;
        INSERT INTO search_index (article_id, kind, ref_id, text)
        SELECT new.id, 'article', new.id, coalesce(new.title, '') || char(10) || new.text_content
        WHERE new.text_content IS NOT NULL;
    END;

    CREATE TRIGGER articles_search_ad AFTER DELETE ON articles BEGIN
        DELETE FROM search_index WHERE kind = 'article' AND ref_id = old.id;
    END;

    CREATE TRIGGER messages_search_ai AFTER INSERT ON messages BEGIN
        INSERT INTO search_index (article_id, kind, ref_id, text)
        SELECT c.article_id, 'chat', new.id, new.content FROM chats c WHERE c.id = new.chat_id;
    END;

    CREATE TRIGGER messages_search_ad AFTER DELETE ON messages BEGIN
        DELETE FROM search_index WHERE kind = 'chat' AND ref_id = old.id;
    END;

    INSERT INTO search_index (article_id, kind, ref_id, text)
    SELECT c.article_id, 'chat', m.id, m.content
    FROM messages m JOIN chats c ON c.id = m.chat_id;
"#;

/// Which cached image file (in `<app data>/images/`, see `imgcache.rs`)
/// holds each image URL of an article. Rows vanish with their article.
pub const MIGRATION_3: &str = r#"
    CREATE TABLE article_images (
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        file TEXT NOT NULL,
        PRIMARY KEY (article_id, url)
    );
"#;

/// When the article says it was published (from JSON-LD, see
/// scraper/jsonld.rs), separate from `scraped_at` (when *we* fetched it).
pub const MIGRATION_4: &str = r#"
    ALTER TABLE articles ADD COLUMN published_at INTEGER;
"#;

/// What a message is about: `passage` (the first question about a selected
/// passage), `followup` (a reply inside that note), `article` (a question
/// about the whole article) or `library` (a question across saved articles).
/// NULL on rows from before this migration; `src/lib/scope.ts` infers it.
pub const MIGRATION_5: &str = r#"
    ALTER TABLE messages ADD COLUMN scope TEXT;
"#;

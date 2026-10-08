//! Yomu's library as a read-only MCP server (Model Context Protocol), so the
//! agent can look things up itself instead of being handed a few passages.
//!
//! It is a small HTTP server on 127.0.0.1 (random port) that speaks the
//! "streamable HTTP" transport in its simplest form: every request is a
//! JSON-RPC message in a POST, answered with a JSON body. An agent is given
//! its address and a one-off secret in `session/new`, and Yomu approves its
//! calls to these tools (see `agent/rpc.rs`). Every tool only reads: the
//! database is opened with `query_only`, so nothing here can change it.
//!
//! Why HTTP and not a program the agent starts: an agent runs inside the
//! macOS sandbox, which cannot read the app's data folder.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::sync::Arc;

use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// Where the server is and how to prove who is asking.
#[derive(Debug, Clone)]
pub struct McpInfo {
    pub url: String,
    pub token: String,
}

/// The newest protocol version this server knows. A client asking for an
/// older one is answered with that one.
const PROTOCOL_VERSION: &str = "2025-06-18";
const OLDER_VERSIONS: [&str; 2] = ["2025-03-26", "2024-11-05"];

/// Most text one tool call returns, so a long blog cannot flood the agent.
const MAX_RESULT_CHARS: usize = 12_000;
const MAX_BODY_BYTES: usize = 1_000_000;
const MAX_HEADER_BYTES: usize = 64 * 1024;

struct State {
    db: SqlitePool,
    token: String,
}

/// Starts the server for the database at `db_path` and returns its address.
/// Runs until the app exits.
pub async fn start(db_path: PathBuf) -> Result<McpInfo, String> {
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        // Belt and braces: even a bug in a tool cannot write.
        .pragma("query_only", "ON")
        .busy_timeout(std::time::Duration::from_secs(5));
    let db = SqlitePoolOptions::new()
        .max_connections(2)
        .connect_lazy_with(options);

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("could not start the library server: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("could not start the library server: {e}"))?
        .port();
    let token = new_token();
    let state = Arc::new(State {
        db,
        token: token.clone(),
    });

    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                continue;
            };
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                let _ = serve(stream, state).await;
            });
        }
    });

    Ok(McpInfo {
        url: format!("http://127.0.0.1:{port}/mcp"),
        token,
    })
}

/// 256 bits nobody can guess: the standard library seeds every
/// `RandomState` from the operating system.
fn new_token() -> String {
    (0..4)
        .map(|i| {
            let mut hasher = RandomState::new().build_hasher();
            hasher.write_u32(i);
            format!("{:016x}", hasher.finish())
        })
        .collect()
}

// ---------------------------------------------------------------- HTTP ----

struct Request {
    method: String,
    path: String,
    authorization: Option<String>,
    body: Vec<u8>,
}

/// Answers requests on one connection until the client closes it.
async fn serve(mut stream: TcpStream, state: Arc<State>) -> std::io::Result<()> {
    let mut buffer: Vec<u8> = Vec::new();
    loop {
        let Some(request) = read_request(&mut stream, &mut buffer).await? else {
            return Ok(());
        };
        let (status, body) = respond(&state, request).await;
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: keep-alive\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).await?;
        stream.write_all(body.as_bytes()).await?;
        stream.flush().await?;
    }
}

/// Reads one request, or `None` when the client has finished. `buffer` keeps
/// what was read past the end of this request (the start of the next).
async fn read_request(
    stream: &mut TcpStream,
    buffer: &mut Vec<u8>,
) -> std::io::Result<Option<Request>> {
    let head_end = loop {
        if let Some(at) = find(buffer, b"\r\n\r\n") {
            break at;
        }
        if buffer.len() > MAX_HEADER_BYTES {
            return Ok(None);
        }
        let mut chunk = [0u8; 4096];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Ok(None);
        }
        buffer.extend_from_slice(&chunk[..n]);
    };

    let head = String::from_utf8_lossy(&buffer[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or("").split(' ');
    let method = first.next().unwrap_or("").to_string();
    let path = first.next().unwrap_or("").to_string();
    let mut authorization = None;
    let mut length = 0usize;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match name.trim().to_ascii_lowercase().as_str() {
            "authorization" => authorization = Some(value.to_string()),
            "content-length" => length = value.parse().unwrap_or(0),
            _ => {}
        }
    }
    if length > MAX_BODY_BYTES {
        return Ok(None);
    }

    let body_start = head_end + 4;
    while buffer.len() < body_start + length {
        let mut chunk = [0u8; 4096];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Ok(None);
        }
        buffer.extend_from_slice(&chunk[..n]);
    }
    let body = buffer[body_start..body_start + length].to_vec();
    buffer.drain(..body_start + length);
    Ok(Some(Request {
        method,
        path,
        authorization,
        body,
    }))
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

async fn respond(state: &State, request: Request) -> (&'static str, String) {
    let expected = format!("Bearer {}", state.token);
    if request.authorization.as_deref() != Some(expected.as_str()) {
        return ("401 Unauthorized", String::new());
    }
    if request.path != "/mcp" {
        return ("404 Not Found", String::new());
    }
    match request.method.as_str() {
        "POST" => {}
        // No server-sent stream, and sessions need no tearing down.
        "DELETE" => return ("200 OK", "{}".to_string()),
        _ => return ("405 Method Not Allowed", String::new()),
    }
    let Ok(message) = serde_json::from_slice::<Value>(&request.body) else {
        return ("400 Bad Request", String::new());
    };

    // A batch is answered as a batch; notifications alone get no body.
    let replies: Vec<Value> = match &message {
        Value::Array(items) => {
            let mut out = Vec::new();
            for item in items {
                if let Some(reply) = handle_message(state, item).await {
                    out.push(reply);
                }
            }
            out
        }
        single => handle_message(state, single).await.into_iter().collect(),
    };
    if replies.is_empty() {
        return ("202 Accepted", String::new());
    }
    let body = if message.is_array() {
        Value::Array(replies)
    } else {
        replies.into_iter().next().unwrap_or(Value::Null)
    };
    ("200 OK", body.to_string())
}

// ------------------------------------------------------------ JSON-RPC ----

/// One JSON-RPC message; `None` for a notification (nothing to say back).
async fn handle_message(state: &State, message: &Value) -> Option<Value> {
    let id = message.get("id")?.clone();
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let params = message.get("params").cloned().unwrap_or(Value::Null);

    let result = match method {
        "initialize" => Ok(initialize(&params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_list() })),
        "tools/call" => Ok(call_tool(state, &params).await),
        other => Err(format!("method not found: {other}")),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(message) => {
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": message } })
        }
    })
}

fn initialize(params: &Value) -> Value {
    let asked = params.get("protocolVersion").and_then(Value::as_str);
    let version = match asked {
        Some(v) if OLDER_VERSIONS.contains(&v) => v,
        _ => PROTOCOL_VERSION,
    };
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "yomu", "version": env!("CARGO_PKG_VERSION") },
        "instructions": "The reader's saved blogs. Search first, then read what matters. Cite blogs by title.",
    })
}

fn tool_list() -> Value {
    json!([
        {
            "name": "search_library",
            "description": "Search the reader's saved blogs. Returns the best matching passages, each with its blog's title and id. Use words likely to appear in the text.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Words to look for" },
                    "limit": { "type": "integer", "description": "How many passages (default 8, at most 20)" }
                },
                "required": ["query"]
            }
        },
        {
            "name": "list_articles",
            "description": "List the reader's saved blogs (newest first) with id, title, site and collections. Optionally only those in one collection.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "collection": { "type": "string", "description": "Only blogs in this collection" },
                    "limit": { "type": "integer", "description": "Default 50, at most 200" }
                }
            }
        },
        {
            "name": "list_collections",
            "description": "The reader's collections and how many blogs each holds.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "read_article",
            "description": "Read a saved blog by id. Long blogs come in parts: the reply says where the next part starts (use `offset`). Use `section` to jump to a heading.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The blog's id, from search_library or list_articles" },
                    "section": { "type": "string", "description": "Part of a heading's text, to start reading there" },
                    "offset": { "type": "integer", "description": "Character to start from, to continue a long blog" }
                },
                "required": ["id"]
            }
        },
        {
            "name": "get_comments",
            "description": "The reader's own comments on a blog: the words they marked and what they wrote.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string", "description": "The blog's id" } },
                "required": ["id"]
            }
        }
    ])
}

/// Runs a tool. A failure is reported as a tool result flagged `isError`
/// (so the agent can read it and carry on), not a protocol error.
async fn call_tool(state: &State, params: &Value) -> Value {
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(Value::Null);
    let outcome = match name {
        "search_library" => search_library(&state.db, &args).await,
        "list_articles" => list_articles(&state.db, &args).await,
        "list_collections" => list_collections(&state.db).await,
        "read_article" => read_article(&state.db, &args).await,
        "get_comments" => get_comments(&state.db, &args).await,
        other => Err(format!("unknown tool: {other}")),
    };
    match outcome {
        Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
        Err(message) => {
            json!({ "content": [{ "type": "text", "text": message }], "isError": true })
        }
    }
}

// --------------------------------------------------------------- tools ----

fn text_arg<'a>(args: &'a Value, name: &str) -> Option<&'a str> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn number_arg(args: &Value, name: &str, default: i64, max: i64) -> i64 {
    args.get(name)
        .and_then(Value::as_i64)
        .unwrap_or(default)
        .clamp(1, max)
}

fn db_error(e: sqlx::Error) -> String {
    format!("the library could not be read: {e}")
}

/// A safe FTS5 query from free words: each word quoted and prefix-matched,
/// joined with OR (the same idea as `toRelatedQuery` in `src/lib/db.ts`).
fn match_query(text: &str) -> Option<String> {
    let mut seen = std::collections::HashSet::new();
    let terms: Vec<String> = text
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|w| w.chars().count() >= 3)
        .filter(|w| seen.insert(w.to_lowercase()))
        .take(12)
        .map(|w| format!("\"{w}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" OR "))
}

async fn search_library(db: &SqlitePool, args: &Value) -> Result<String, String> {
    let query = text_arg(args, "query").ok_or("`query` is needed")?;
    let Some(m) = match_query(query) else {
        return Ok("Nothing to search for: use words of at least three letters.".to_string());
    };
    let limit = number_arg(args, "limit", 8, 20);
    let rows = sqlx::query(
        "SELECT si.article_id, a.title,
                snippet(search_index, 3, char(1), char(2), '…', 48) AS snip
         FROM search_index si
         JOIN articles a ON a.id = si.article_id
         WHERE search_index MATCH ?1 AND si.kind = 'article'
         ORDER BY rank
         LIMIT ?2",
    )
    .bind(m)
    .bind(limit)
    .fetch_all(db)
    .await
    .map_err(db_error)?;

    if rows.is_empty() {
        return Ok("No saved blog matches. Try other words.".to_string());
    }
    let mut out = format!("{} matching passages:\n", rows.len());
    for (i, row) in rows.iter().enumerate() {
        let id: String = row.get("article_id");
        let title: Option<String> = row.get("title");
        let snip: String = row.get("snip");
        out.push_str(&format!(
            "\n{}. \"{}\" (id: {id})\n   {}\n",
            i + 1,
            title.unwrap_or_else(|| "Untitled".into()),
            snip.replace(['\u{1}', '\u{2}'], "").replace('\n', " ")
        ));
    }
    Ok(cap(out))
}

async fn list_articles(db: &SqlitePool, args: &Value) -> Result<String, String> {
    let collection = text_arg(args, "collection").map(str::to_lowercase);
    let limit = number_arg(args, "limit", 50, 200);
    let rows = sqlx::query(
        "SELECT a.id, a.title, a.site,
                (SELECT group_concat(t.tag, ', ') FROM article_tags t WHERE t.article_id = a.id) AS tags
         FROM articles a
         WHERE a.archived = 0
           AND (?1 IS NULL OR EXISTS
                (SELECT 1 FROM article_tags t WHERE t.article_id = a.id AND lower(t.tag) = ?1))
         ORDER BY a.scraped_at DESC
         LIMIT ?2",
    )
    .bind(collection)
    .bind(limit)
    .fetch_all(db)
    .await
    .map_err(db_error)?;

    if rows.is_empty() {
        return Ok("No saved blogs.".to_string());
    }
    let mut out = format!("{} saved blogs:\n", rows.len());
    for row in rows {
        let id: String = row.get("id");
        let title: Option<String> = row.get("title");
        let site: Option<String> = row.get("site");
        let tags: Option<String> = row.get("tags");
        out.push_str(&format!(
            "\n- \"{}\" — {} (id: {id}){}",
            title.unwrap_or_else(|| "Untitled".into()),
            site.unwrap_or_default(),
            tags.map(|t| format!(", in: {t}")).unwrap_or_default()
        ));
    }
    Ok(cap(out))
}

async fn list_collections(db: &SqlitePool) -> Result<String, String> {
    let rows = sqlx::query(
        "SELECT t.tag, COUNT(*) AS n
         FROM article_tags t JOIN articles a ON a.id = t.article_id
         WHERE a.archived = 0
         GROUP BY t.tag ORDER BY t.tag",
    )
    .fetch_all(db)
    .await
    .map_err(db_error)?;
    if rows.is_empty() {
        return Ok("No collections.".to_string());
    }
    let lines: Vec<String> = rows
        .iter()
        .map(|r| {
            format!(
                "- {} ({} blogs)",
                r.get::<String, _>("tag"),
                r.get::<i64, _>("n")
            )
        })
        .collect();
    Ok(lines.join("\n"))
}

async fn read_article(db: &SqlitePool, args: &Value) -> Result<String, String> {
    let id = text_arg(args, "id").ok_or("`id` is needed")?;
    let row = sqlx::query("SELECT title, url, blocks_json FROM articles WHERE id = ?1")
        .bind(id)
        .fetch_optional(db)
        .await
        .map_err(db_error)?
        .ok_or("No saved blog has that id. Get ids from search_library or list_articles.")?;
    let title: Option<String> = row.get("title");
    let url: String = row.get("url");
    let blocks: Vec<Value> = serde_json::from_str(&row.get::<String, _>("blocks_json"))
        .map_err(|e| format!("this blog's saved text is unreadable: {e}"))?;

    // Text of each block, with where each heading starts.
    let mut text = String::new();
    let mut headings: Vec<(usize, String)> = Vec::new();
    for block in &blocks {
        let piece = block_text(block);
        if piece.is_empty() {
            continue;
        }
        if block.get("type").and_then(Value::as_str) == Some("heading") {
            headings.push((
                text.chars().count(),
                block
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            ));
        }
        text.push_str(&piece);
        text.push_str("\n\n");
    }

    let mut start = args.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    if let Some(section) = text_arg(args, "section") {
        let wanted = section.to_lowercase();
        match headings
            .iter()
            .find(|(_, h)| h.to_lowercase().contains(&wanted))
        {
            Some((at, _)) => start = *at,
            None => {
                let names: Vec<&str> = headings.iter().map(|(_, h)| h.as_str()).collect();
                return Err(format!(
                    "No heading contains \"{section}\". Headings: {}",
                    names.join(" | ")
                ));
            }
        }
    }

    let total = text.chars().count();
    let part: String = text.chars().skip(start).take(MAX_RESULT_CHARS).collect();
    let end = start + part.chars().count();
    let mut out = format!(
        "\"{}\" ({url})\n\n{}",
        title.unwrap_or_else(|| "Untitled".into()),
        part.trim_end()
    );
    if end < total {
        out.push_str(&format!(
            "\n\n[Part shown: characters {start}–{end} of {total}. Call read_article again with offset {end} to continue.]"
        ));
    }
    if start == 0 && !headings.is_empty() {
        let names: Vec<&str> = headings.iter().map(|(_, h)| h.as_str()).collect();
        out.push_str(&format!("\n\n[Headings: {}]", names.join(" | ")));
    }
    Ok(out)
}

async fn get_comments(db: &SqlitePool, args: &Value) -> Result<String, String> {
    let id = text_arg(args, "id").ok_or("`id` is needed")?;
    let rows = sqlx::query(
        "SELECT quote, note FROM annotations
         WHERE article_id = ?1 AND note IS NOT NULL
         ORDER BY block_index, start_offset",
    )
    .bind(id)
    .fetch_all(db)
    .await
    .map_err(db_error)?;
    if rows.is_empty() {
        return Ok("The reader has no comments on this blog.".to_string());
    }
    let lines: Vec<String> = rows
        .iter()
        .map(|r| {
            format!(
                "- On \"{}\": {}",
                r.get::<String, _>("quote"),
                r.get::<String, _>("note")
            )
        })
        .collect();
    Ok(cap(lines.join("\n")))
}

fn cap(text: String) -> String {
    if text.chars().count() <= MAX_RESULT_CHARS {
        return text;
    }
    let mut cut: String = text.chars().take(MAX_RESULT_CHARS).collect();
    cut.push_str("\n[cut: too long]");
    cut
}

/// The text of one saved block (the same shape as `blockText` in
/// `src/lib/article-text.ts`).
fn block_text(block: &Value) -> String {
    let spans = |value: Option<&Value>| -> String {
        value
            .and_then(Value::as_array)
            .map(|spans| {
                spans
                    .iter()
                    .filter_map(|s| s.get("text").and_then(Value::as_str))
                    .collect()
            })
            .unwrap_or_default()
    };
    let str_at = |key: &str| block.get(key).and_then(Value::as_str).unwrap_or("");
    match block.get("type").and_then(Value::as_str).unwrap_or("") {
        "heading" => {
            let level = block
                .get("level")
                .and_then(Value::as_u64)
                .unwrap_or(2)
                .clamp(1, 6);
            format!("{} {}", "#".repeat(level as usize), str_at("text"))
        }
        "paragraph" => spans(block.get("spans")),
        "code" => format!("```{}\n{}\n```", str_at("language"), str_at("content")),
        "math" => format!("$${}$$", str_at("tex")),
        "image" => {
            let alt = str_at("alt");
            if alt.is_empty() {
                String::new()
            } else {
                format!("[image: {alt}]")
            }
        }
        "list" => {
            let ordered = block
                .get("ordered")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            block
                .get("items")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .enumerate()
                        .map(|(i, item)| {
                            let depth =
                                item.get("depth").and_then(Value::as_u64).unwrap_or(0) as usize;
                            let marker = if ordered {
                                format!("{}.", i + 1)
                            } else {
                                "-".into()
                            };
                            format!(
                                "{}{marker} {}",
                                "  ".repeat(depth),
                                spans(item.get("spans"))
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default()
        }
        "quote" => spans(block.get("spans"))
            .split('\n')
            .map(|line| format!("> {line}"))
            .collect::<Vec<_>>()
            .join("\n"),
        "table" => {
            let row = |v: &Value| -> Option<String> {
                let cells: Vec<&str> = v.as_array()?.iter().filter_map(Value::as_str).collect();
                (!cells.is_empty()).then(|| format!("| {} |", cells.join(" | ")))
            };
            let mut rows: Vec<String> = block.get("header").and_then(row).into_iter().collect();
            if let Some(body) = block.get("rows").and_then(Value::as_array) {
                rows.extend(body.iter().filter_map(row));
            }
            rows.join("\n")
        }
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn match_query_quotes_every_word_and_skips_short_ones() {
        assert_eq!(
            match_query("hot shards in Postgres!").as_deref(),
            Some("\"hot\"* OR \"shards\"* OR \"Postgres\"*")
        );
        assert_eq!(match_query("a an of"), None);
        // Nothing the agent types can break out of the quotes.
        assert_eq!(match_query("x\" OR 1 --").as_deref(), None,);
    }

    #[test]
    fn blocks_become_text() {
        let list = json!({ "type": "list", "ordered": true, "items": [
            { "depth": 0, "spans": [{ "text": "one" }] },
            { "depth": 1, "spans": [{ "text": "two" }] },
        ]});
        assert_eq!(block_text(&list), "1. one\n  2. two");
        let heading = json!({ "type": "heading", "level": 2, "text": "Storage" });
        assert_eq!(block_text(&heading), "## Storage");
        let table = json!({ "type": "table", "header": ["a", "b"], "rows": [["1", "2"]] });
        assert_eq!(block_text(&table), "| a | b |\n| 1 | 2 |");
        let image = json!({ "type": "image", "src": "x", "alt": null });
        assert_eq!(block_text(&image), "");
    }

    /// A database with every migration applied and two saved blogs, and a
    /// server reading it.
    async fn fixture(name: &str) -> (McpInfo, reqwest::Client) {
        let path = std::env::temp_dir().join(format!("yomu-mcp-test-{name}.db"));
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        for migration in crate::db::migrations() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        let neon = json!([
            { "type": "heading", "level": 1, "text": "Inside Neon" },
            { "type": "paragraph", "spans": [{ "text": "Neon separates storage and compute." }] },
            { "type": "heading", "level": 2, "text": "Durability" },
            { "type": "paragraph", "spans": [{ "text": "Safekeepers hold the write-ahead log." }] },
        ]);
        let long = json!([
            { "type": "heading", "level": 1, "text": "Long read" },
            { "type": "paragraph", "spans": [{ "text": "word ".repeat(5000) }] },
        ]);
        for (id, title, blocks, text) in [
            (
                "a1",
                "Inside Neon",
                neon,
                "Neon separates storage and compute. Safekeepers hold the write-ahead log.",
            ),
            ("a2", "Long read", long, "word word"),
        ] {
            sqlx::query(
                "INSERT INTO articles (id, url, canonical_url, title, site, blocks_json, scraped_at, text_content)
                 VALUES (?1, ?2, ?2, ?3, 'example.dev', ?4, 1, ?5)",
            )
            .bind(id)
            .bind(format!("https://example.dev/{id}"))
            .bind(title)
            .bind(blocks.to_string())
            .bind(text)
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::query("INSERT INTO article_tags (article_id, tag) VALUES ('a1', 'databases')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO annotations (id, article_id, block_index, start_offset, end_offset, quote, note, created_at, updated_at)
             VALUES ('n1', 'a1', 1, 0, 4, 'Neon separates', 'Remember this', 1, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool.close().await;
        (start(path).await.unwrap(), reqwest::Client::new())
    }

    async fn rpc(
        (info, client): &(McpInfo, reqwest::Client),
        method: &str,
        params: Value,
    ) -> Value {
        client
            .post(&info.url)
            .bearer_auth(&info.token)
            .body(
                json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
                    .to_string(),
            )
            .send()
            .await
            .unwrap()
            .text()
            .await
            .map(|text| serde_json::from_str(&text).unwrap())
            .unwrap()
    }

    /// The text a tool call returned, and whether it was an error.
    async fn tool(f: &(McpInfo, reqwest::Client), name: &str, args: Value) -> (String, bool) {
        let reply = rpc(f, "tools/call", json!({ "name": name, "arguments": args })).await;
        let result = &reply["result"];
        (
            result["content"][0]["text"].as_str().unwrap().to_string(),
            result["isError"].as_bool().unwrap_or(false),
        )
    }

    #[tokio::test]
    async fn refuses_anyone_without_the_secret() {
        let (info, client) = fixture("auth").await;
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" });
        let none = client
            .post(&info.url)
            .body(body.to_string())
            .send()
            .await
            .unwrap();
        assert_eq!(none.status(), 401);
        let wrong = client
            .post(&info.url)
            .bearer_auth("not-it")
            .body(body.to_string())
            .send()
            .await
            .unwrap();
        assert_eq!(wrong.status(), 401);
        let wrong_path = client
            .post(info.url.replace("/mcp", "/other"))
            .bearer_auth(&info.token)
            .body(body.to_string())
            .send()
            .await
            .unwrap();
        assert_eq!(wrong_path.status(), 404);
    }

    #[tokio::test]
    async fn introduces_itself_and_lists_its_tools() {
        let f = fixture("intro").await;
        let init = rpc(&f, "initialize", json!({ "protocolVersion": "2025-06-18" })).await;
        assert_eq!(init["result"]["serverInfo"]["name"], "yomu");
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        let older = rpc(&f, "initialize", json!({ "protocolVersion": "2024-11-05" })).await;
        assert_eq!(older["result"]["protocolVersion"], "2024-11-05");

        let tools = rpc(&f, "tools/list", json!({})).await;
        let names: Vec<&str> = tools["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert_eq!(
            names,
            [
                "search_library",
                "list_articles",
                "list_collections",
                "read_article",
                "get_comments"
            ]
        );
        // A notification is accepted without an answer.
        let (info, client) = &f;
        let note = client
            .post(&info.url)
            .bearer_auth(&info.token)
            .body(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string())
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 202);
    }

    #[tokio::test]
    async fn searches_lists_and_reads_the_library() {
        let f = fixture("tools").await;

        let (found, error) =
            tool(&f, "search_library", json!({ "query": "storage compute" })).await;
        assert!(!error);
        assert!(found.contains("\"Inside Neon\" (id: a1)"), "{found}");
        assert!(!found.contains('\u{1}'));

        let (none, _) = tool(&f, "search_library", json!({ "query": "kubernetes" })).await;
        assert!(none.contains("No saved blog matches"));

        let (listed, _) = tool(&f, "list_articles", json!({})).await;
        assert!(listed.contains("Inside Neon") && listed.contains("Long read"));
        let (only, _) = tool(&f, "list_articles", json!({ "collection": "Databases" })).await;
        assert!(only.contains("Inside Neon") && !only.contains("Long read"));
        assert!(only.contains("in: databases"));

        let (collections, _) = tool(&f, "list_collections", json!({})).await;
        assert_eq!(collections, "- databases (1 blogs)");

        let (article, _) = tool(&f, "read_article", json!({ "id": "a1" })).await;
        assert!(article.contains("# Inside Neon") && article.contains("Safekeepers"));
        assert!(article.contains("[Headings: Inside Neon | Durability]"));
        let (section, _) = tool(
            &f,
            "read_article",
            json!({ "id": "a1", "section": "durab" }),
        )
        .await;
        assert!(section.contains("Safekeepers") && !section.contains("separates storage"));

        let (comments, _) = tool(&f, "get_comments", json!({ "id": "a1" })).await;
        assert_eq!(comments, "- On \"Neon separates\": Remember this");
        let (no_comments, _) = tool(&f, "get_comments", json!({ "id": "a2" })).await;
        assert!(no_comments.contains("no comments"));
    }

    #[tokio::test]
    async fn a_long_blog_is_read_in_parts() {
        let f = fixture("long").await;
        let (first, _) = tool(&f, "read_article", json!({ "id": "a2" })).await;
        assert!(
            first.contains("Call read_article again with offset"),
            "{}",
            &first[first.len() - 200..]
        );
        let next = first
            .rsplit("with offset ")
            .next()
            .and_then(|t| t.split_whitespace().next())
            .unwrap()
            .parse::<u64>()
            .unwrap();
        let (second, _) = tool(&f, "read_article", json!({ "id": "a2", "offset": next })).await;
        assert!(second.contains("word"));
    }

    #[tokio::test]
    async fn mistakes_come_back_as_errors_the_agent_can_read() {
        let f = fixture("errors").await;
        let (missing, error) = tool(&f, "read_article", json!({ "id": "nope" })).await;
        assert!(error && missing.contains("No saved blog has that id"));
        let (bad, error) = tool(&f, "read_article", json!({ "id": "a1", "section": "zzz" })).await;
        assert!(error && bad.contains("Headings: Inside Neon | Durability"));
        let (unknown, error) = tool(&f, "delete_everything", json!({})).await;
        assert!(error && unknown.contains("unknown tool"));
        let (empty, error) = tool(&f, "search_library", json!({})).await;
        assert!(error && empty.contains("`query` is needed"));
    }

    #[test]
    fn tokens_differ_and_are_long() {
        let (a, b) = (new_token(), new_token());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}

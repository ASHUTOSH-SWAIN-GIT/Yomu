mod blocks;
mod fetch;
mod lang_detect;
mod meta;
mod normalize;
mod rules;

use std::time::{SystemTime, UNIX_EPOCH};

use scraper::Html;
use serde::Serialize;
use thiserror::Error;

pub use blocks::Block;

#[derive(Debug, Error)]
pub enum ScrapeError {
    #[error("that doesn't look like a valid URL")]
    InvalidUrl(#[from] url::ParseError),
    #[error("could not reach that page: {0}")]
    Network(#[from] reqwest::Error),
    #[error("the site returned an error (HTTP {0})")]
    HttpStatus(u16),
    #[error("could not extract readable content from this page")]
    ExtractionFailed,
}

/// The result of scraping one article. Distinct from the eventual
/// `articles` SQLite row (see ROADMAP.md M3) — this is what a fresh
/// scrape produces before it is ever saved.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedArticle {
    pub url: String,
    pub canonical_url: String,
    pub title: String,
    pub author: Option<String>,
    pub site: String,
    pub blocks: Vec<Block>,
    pub scraped_at: u64,
}

/// Scrapes and parses a single article on demand. No crawling, no caching:
/// every call re-fetches. Caching by canonical URL is a library (M3)
/// concern once articles are actually persisted.
pub async fn scrape(raw_url: &str) -> Result<ScrapedArticle, ScrapeError> {
    let canonical = normalize::canonicalize(raw_url)?;

    let client = fetch::build_client()?;
    let fetched = fetch::fetch_html(&client, canonical.as_str()).await?;

    let original_document = Html::parse_document(&fetched.html);
    let final_url = url::Url::parse(&fetched.final_url).unwrap_or(canonical.clone());
    let host = final_url.host_str().unwrap_or("unknown").to_string();

    // Known docs frameworks first (see rules.rs), Readability otherwise.
    let (mut blocks, title) = if let Some(found) = rules::extract_content(&original_document) {
        let title = match found.title_source {
            rules::TitleSource::ContentH1 => {
                meta::extract_title(&Html::parse_fragment(&found.html))
            }
            rules::TitleSource::PageH1 => meta::extract_title(&original_document),
            rules::TitleSource::TitleTag => meta::extract_title_tag(&original_document),
        };
        (
            blocks::html_to_blocks(&found.html),
            title
                .or_else(|| meta::extract_title(&original_document))
                .unwrap_or_else(|| host.clone()),
        )
    } else {
        let mut html_bytes = fetched.html.as_bytes();
        let product = readability::extractor::extract(&mut html_bytes, &final_url)
            .map_err(|_| ScrapeError::ExtractionFailed)?;
        let title = match product.title.trim() {
            "" => host.clone(),
            t => t.to_string(),
        };
        (blocks::html_to_blocks(&product.content), title)
    };
    if blocks.is_empty() {
        return Err(ScrapeError::ExtractionFailed);
    }
    drop_repeated_title(&mut blocks, &title);

    Ok(ScrapedArticle {
        url: fetched.final_url,
        canonical_url: canonical.to_string(),
        title,
        author: meta::extract_author(&original_document),
        site: meta::extract_site_name(&original_document, &host),
        blocks,
        scraped_at: now_millis(),
    })
}

/// Docs pages start their content with an `h1` that repeats the title the
/// reader already shows in its header.
fn drop_repeated_title(blocks: &mut Vec<Block>, title: &str) {
    if let Some(Block::Heading { level: 1, text }) = blocks.first() {
        if title.contains(text.as_str()) {
            blocks.remove(0);
        }
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Normalizes a URL without fetching anything. Used by the frontend to
/// compute a cache key before deciding whether a scrape is even needed
/// (see the `articles` cache-by-canonical-url flow in ROADMAP.md M3).
pub fn canonical_url(raw_url: &str) -> Result<String, ScrapeError> {
    Ok(normalize::canonicalize(raw_url)?.to_string())
}

/// Opt-in timing check for ROADMAP.md M6 ("scrape under a few seconds on
/// normal pages"). Hits the network: `cargo test scrape_timing -- --ignored --nocapture`.
#[cfg(test)]
mod timing {
    use std::time::Instant;

    #[tokio::test]
    #[ignore]
    async fn scrape_timing() {
        for url in [
            "https://kubernetes.io/docs/concepts/workloads/pods/",
            "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html",
            "https://react.dev/learn/thinking-in-react",
            "https://en.wikipedia.org/wiki/Rust_(programming_language)",
            "https://docusaurus.io/docs",
            "https://squidfunk.github.io/mkdocs-material/getting-started/",
            "https://dev.to/wiseai/i-built-a-version-bump-tool-in-rust-that-is-10000x-faster-than-its-python-counterparts-i6b",
        ] {
            let start = Instant::now();
            match super::scrape(url).await {
                Ok(a) => {
                    let count = |name: &str| {
                        a.blocks
                            .iter()
                            .filter(|b| {
                                serde_json::to_value(b).unwrap()["type"] == name
                            })
                            .count()
                    };
                    println!(
                        "{:>6} ms  {:>4} blocks (list {}, table {}, quote {}, code {})  {:?}  {url}",
                        start.elapsed().as_millis(),
                        a.blocks.len(),
                        count("list"),
                        count("table"),
                        count("quote"),
                        count("code"),
                        a.title,
                    )
                }
                Err(e) => println!("{:>6} ms  ERROR {e}  {url}", start.elapsed().as_millis()),
            }
        }
    }
}

mod blocks;
mod fetch;
mod images;
mod lang_detect;
mod meta;
mod normalize;
mod render;
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
    #[error("the site blocked automated access (a bot check); try opening it in your browser")]
    Blocked,
    #[error("could not render this page: {0}")]
    Render(String),
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

/// The HTTP client used for scraping (real browser User-Agent, redirects,
/// timeouts), shared with the image cache.
pub fn http_client() -> Result<reqwest::Client, ScrapeError> {
    fetch::build_client()
}

/// Pages with fewer words than this are suspected of being JavaScript
/// rendered (or blocked), so a hidden webview gets a try (ROADMAP.md M2).
const MIN_WORDS: usize = 200;

fn word_count(blocks: &[Block]) -> usize {
    let spans = |spans: &[blocks::Span]| -> usize {
        spans
            .iter()
            .map(|s| s.text.split_whitespace().count())
            .sum()
    };
    blocks
        .iter()
        .map(|b| match b {
            Block::Heading { text, .. } => text.split_whitespace().count(),
            Block::Paragraph { spans: s } | Block::Quote { spans: s } => spans(s),
            Block::List { items, .. } => items.iter().map(|i| spans(&i.spans)).sum(),
            Block::Table { header, rows } => header
                .iter()
                .chain(rows.iter().flatten())
                .map(|c| c.split_whitespace().count())
                .sum(),
            Block::Code { .. } | Block::Image { .. } | Block::Math { .. } => 0,
        })
        .sum()
}

/// Scrapes and parses a single article on demand. No crawling, no caching:
/// every call re-fetches. Caching by canonical URL is a library (M3)
/// concern once articles are actually persisted.
///
/// A plain HTTP fetch is tried first (fast, no window). If that fails or
/// yields a thin page and an `app` handle is given, the page is re-read
/// through a hidden webview, and the fuller result wins.
pub async fn scrape(
    raw_url: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<ScrapedArticle, ScrapeError> {
    let canonical = normalize::canonicalize(raw_url)?;

    let client = fetch::build_client()?;
    let plain = match fetch::fetch_html(&client, canonical.as_str()).await {
        Ok(fetched) => extract(&fetched.html, &fetched.final_url, &canonical),
        Err(e) => Err(e),
    };

    let thin = match &plain {
        Ok(article) => word_count(&article.blocks) < MIN_WORDS,
        Err(_) => true,
    };
    let Some(app) = app.filter(|_| thin) else {
        return plain;
    };

    log::info!("plain fetch of {canonical} was thin or failed; trying a rendered page");
    let rendered = match render::render_html(app, canonical.as_str()).await {
        Ok(html) if render::looks_like_bot_check(&html) => Err(ScrapeError::Blocked),
        Ok(html) => extract(&html, canonical.as_str(), &canonical),
        Err(e) => Err(e),
    };

    match (plain, rendered) {
        (Ok(p), Ok(r)) => Ok(if word_count(&r.blocks) > word_count(&p.blocks) {
            r
        } else {
            p
        }),
        (Ok(p), Err(_)) => Ok(p),
        (Err(_), Ok(r)) => Ok(r),
        // Both failed: the rendered error usually says more (e.g. a bot
        // check) than a bare HTTP status.
        (Err(plain_err), Err(render_err)) => {
            log::warn!("scrape of {canonical} failed: {plain_err}; rendered: {render_err}");
            Err(match render_err {
                ScrapeError::Blocked => ScrapeError::Blocked,
                _ => plain_err,
            })
        }
    }
}

/// Turns fetched or rendered HTML into an article.
fn extract(
    html: &str,
    final_url: &str,
    canonical: &url::Url,
) -> Result<ScrapedArticle, ScrapeError> {
    let original_document = Html::parse_document(html);
    let final_parsed = url::Url::parse(final_url).unwrap_or(canonical.clone());
    let host = final_parsed.host_str().unwrap_or("unknown").to_string();

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
            blocks::html_to_blocks_with_base(&found.html, Some(&final_parsed)),
            title
                .or_else(|| meta::extract_title(&original_document))
                .unwrap_or_else(|| host.clone()),
        )
    } else {
        // Readability discards image-only containers, <picture>, and lazy
        // images, so swap them for text placeholders first (see images.rs).
        let (tokenized, found_images) = images::tokenize_images(html, &final_parsed);
        let mut html_bytes = tokenized.as_bytes();
        let product = readability::extractor::extract(&mut html_bytes, &final_parsed)
            .map_err(|_| ScrapeError::ExtractionFailed)?;
        let title = match product.title.trim() {
            "" => host.clone(),
            t => meta::clean_title(&original_document, t),
        };
        let blocks = blocks::html_to_blocks_with_base(&product.content, Some(&final_parsed));
        (images::restore_image_tokens(blocks, &found_images), title)
    };
    if blocks.is_empty() {
        return Err(ScrapeError::ExtractionFailed);
    }
    drop_repeated_title(&mut blocks, &title);

    Ok(ScrapedArticle {
        url: final_url.to_string(),
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

#[cfg(test)]
mod extract_tests {
    use super::*;

    /// Readability strips <picture> and src-less <img>; `extract` must still
    /// return these images (regression: every Medium image was lost).
    #[test]
    fn extract_keeps_picture_and_lazy_images() {
        let para = "This paragraph is long enough to look like real article prose. ".repeat(6);
        let html = format!(
            r#"<html><head><title>T</title></head><body><article>
            <h1>Title</h1><p>{para}</p>
            <figure><picture><source srcSet="https://cdn.x/pic-1400.png 1400w, https://cdn.x/pic-640.png 640w"><img alt="Pic" role="presentation" width="700" height="300"></picture></figure>
            <p>{para}</p>
            <img class="lazy" data-src="/lazy.jpg" alt="Lazy" width="600" height="400">
            <p>{para}</p></article></body></html>"#
        );
        let base = url::Url::parse("https://blog.example/post").unwrap();
        let article = extract(&html, "https://blog.example/post", &base).expect("extracts");
        let srcs: Vec<&str> = article
            .blocks
            .iter()
            .filter_map(|b| match b {
                Block::Image { src, .. } => Some(src.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(
            srcs,
            vec![
                "https://cdn.x/pic-1400.png",
                "https://blog.example/lazy.jpg"
            ]
        );
    }
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
            "https://dev.to/aws/how-ai-actually-calls-an-api-tool-calling-explained-from-scratch-4lf8",
            "https://dev.to/anchildress1/is-this-really-required-meet-gh-stack-5g1f",
            "https://medium.com/data-science-collective/ai-hallucination-is-nothing-but-a-plausible-prediction-gone-wrong-10d0b6a33209",
            "https://docusaurus.io/docs",
            "https://squidfunk.github.io/mkdocs-material/getting-started/",
            "https://dev.to/wiseai/i-built-a-version-bump-tool-in-rust-that-is-10000x-faster-than-its-python-counterparts-i6b",
        ] {
            let start = Instant::now();
            match super::scrape(url, None).await {
                Ok(a) => {
                    let count = |name: &str| {
                        a.blocks
                            .iter()
                            .filter(|b| {
                                serde_json::to_value(b).unwrap()["type"] == name
                            })
                            .count()
                    };
                    let imgs: Vec<&str> = a.blocks.iter().filter_map(|b| match b { super::Block::Image { src, .. } => Some(src.as_str()), _ => None }).collect();
                    let remote = imgs.iter().filter(|s| s.starts_with("http")).count();
                    let data = imgs.iter().filter(|s| s.starts_with("data:")).count();
                    println!("   IMAGES {} total, {remote} http(s), {data} data:, {} other/relative  e.g. {:?}", imgs.len(), imgs.len() - remote - data, imgs.iter().take(2).map(|s| &s[..s.len().min(90)]).collect::<Vec<_>>());
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

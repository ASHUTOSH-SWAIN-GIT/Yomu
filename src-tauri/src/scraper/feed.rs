//! Finds a site's RSS/Atom feed and reads its posts. Stateless: the frontend
//! decides which posts are new and saves them (see feeds-store.ts), the same
//! split as bookmarks.rs.

use std::collections::HashSet;

use scraper::{Html, Selector};
use serde::Serialize;
use url::Url;

use super::{fetch, normalize, ScrapeError};

const FEED_ACCEPT: &str = "application/rss+xml, application/atom+xml, application/xml;q=0.9, \
     text/xml;q=0.9, */*;q=0.8";
/// Most requests one discovery may make, so a site with no feed is given up on
/// quickly.
const MAX_REQUESTS: usize = 10;
const FEED_TYPES: [&str; 3] = [
    "application/rss+xml",
    "application/atom+xml",
    "application/feed+json",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedEntry {
    pub url: String,
    pub title: String,
    /// Unix millis.
    pub published_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundFeed {
    pub feed_url: String,
    pub site_url: Option<String>,
    pub title: String,
    /// Newest first.
    pub entries: Vec<FeedEntry>,
}

/// Finds the feed of the site `page_url` is on, and reads it.
pub async fn discover(page_url: &str) -> Result<FoundFeed, ScrapeError> {
    let page = normalize::canonicalize(page_url)?;
    let client = fetch::build_client()?;
    let mut tried: HashSet<String> = HashSet::new();
    let mut requests = 0;

    if let Some(url) = platform_feed(&page) {
        if let Some(found) = try_feed(&client, &url, &mut tried, &mut requests).await {
            return Ok(found);
        }
    }

    // The page itself (it may be the feed), then the site's front page.
    let mut pages = vec![page.clone()];
    if page.path() != "/" {
        if let Ok(home) = page.join("/") {
            pages.push(home);
        }
    }
    for url in pages {
        if requests >= MAX_REQUESTS {
            break;
        }
        requests += 1;
        let Ok(fetched) = fetch::fetch_html(&client, url.as_str()).await else {
            continue;
        };
        let base = Url::parse(&fetched.final_url).unwrap_or(url);
        if looks_like_feed(&fetched.html) {
            if let Ok(found) = parse_feed(&fetched.html, &base) {
                return Ok(found);
            }
        }
        for link in feed_links_in(&fetched.html, &base) {
            if let Some(found) = try_feed(&client, &link, &mut tried, &mut requests).await {
                return Ok(found);
            }
        }
    }

    for url in probe_urls(&page) {
        if let Some(found) = try_feed(&client, &url, &mut tried, &mut requests).await {
            return Ok(found);
        }
    }
    Err(ScrapeError::NoFeed)
}

/// Reads a feed whose address is already known.
pub async fn read(feed_url: &str) -> Result<FoundFeed, ScrapeError> {
    let url = Url::parse(feed_url)?;
    let client = fetch::build_client()?;
    let fetched = fetch::fetch_text(&client, url.as_str(), FEED_ACCEPT).await?;
    let base = Url::parse(&fetched.final_url).unwrap_or(url);
    parse_feed(&fetched.html, &base)
}

/// Fetches one candidate, once, and returns it if it is a feed with posts.
async fn try_feed(
    client: &reqwest::Client,
    url: &Url,
    tried: &mut HashSet<String>,
    requests: &mut usize,
) -> Option<FoundFeed> {
    if *requests >= MAX_REQUESTS || !tried.insert(url.to_string()) {
        return None;
    }
    *requests += 1;
    let fetched = fetch::fetch_text(client, url.as_str(), FEED_ACCEPT)
        .await
        .ok()?;
    if !looks_like_feed(&fetched.html) {
        return None;
    }
    let base = Url::parse(&fetched.final_url).unwrap_or_else(|_| url.clone());
    parse_feed(&fetched.html, &base).ok()
}

/// The feeds a page advertises with `<link rel="alternate">`, the main feed
/// before any comments feed.
fn feed_links_in(html: &str, base: &Url) -> Vec<Url> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("link[rel][href]").unwrap();
    let mut links: Vec<(bool, Url)> = Vec::new();
    for el in doc.select(&sel) {
        let v = el.value();
        let is_alternate = v.attr("rel").is_some_and(|r| {
            r.split_whitespace()
                .any(|t| t.eq_ignore_ascii_case("alternate"))
        });
        let kind = v.attr("type").unwrap_or("").to_ascii_lowercase();
        if !is_alternate || !FEED_TYPES.contains(&kind.as_str()) {
            continue;
        }
        let Ok(url) = base.join(v.attr("href").unwrap_or("")) else {
            continue;
        };
        let is_comments = url.as_str().to_ascii_lowercase().contains("comment")
            || v.attr("title")
                .is_some_and(|t| t.to_ascii_lowercase().contains("comment"));
        links.push((is_comments, url));
    }
    links.sort_by_key(|(comments, _)| *comments);
    links.into_iter().map(|(_, url)| url).collect()
}

/// Feed addresses of platforms whose pages don't advertise one.
fn platform_feed(page: &Url) -> Option<Url> {
    let host = page.host_str()?.trim_start_matches("www.");
    let path = if host == "medium.com" {
        let first = page.path_segments()?.next().filter(|s| !s.is_empty())?;
        format!("/feed/{first}")
    } else if host.ends_with(".medium.com") || host.ends_with(".substack.com") {
        "/feed".to_string()
    } else {
        return None;
    };
    let mut feed = page.join(&path).ok()?;
    feed.set_query(None);
    Some(feed)
}

/// Where sites usually keep their feed.
fn probe_urls(origin: &Url) -> Vec<Url> {
    [
        "/feed",
        "/rss.xml",
        "/atom.xml",
        "/index.xml",
        "/feed.xml",
        "/rss/",
    ]
    .iter()
    .filter_map(|p| origin.join(p).ok())
    .collect()
}

/// A page that answers 200 for any address (a soft 404) is HTML, not a feed.
fn looks_like_feed(body: &str) -> bool {
    let mut rest = body.trim_start_matches('\u{feff}').trim_start();
    loop {
        if rest.starts_with("<?") {
            let Some(end) = rest.find("?>") else {
                return false;
            };
            rest = rest[end + 2..].trim_start();
        } else if rest.starts_with("<!--") {
            let Some(end) = rest.find("-->") else {
                return false;
            };
            rest = rest[end + 3..].trim_start();
        } else {
            break;
        }
    }
    let lower: String = rest
        .chars()
        .take(200)
        .collect::<String>()
        .to_ascii_lowercase();
    lower.starts_with("<rss")
        || lower.starts_with("<feed")
        || lower.starts_with("<rdf:rdf")
        || (lower.starts_with('{') && lower.contains("jsonfeed.org"))
}

fn parse_feed(body: &str, feed_url: &Url) -> Result<FoundFeed, ScrapeError> {
    let feed = feed_rs::parser::parse(body.as_bytes()).map_err(|_| ScrapeError::NoFeed)?;
    let resolve = |href: &str| -> Option<Url> {
        let url = feed_url.join(href.trim()).ok()?;
        matches!(url.scheme(), "http" | "https").then_some(url)
    };

    let mut entries: Vec<FeedEntry> = feed
        .entries
        .iter()
        .filter_map(|e| {
            let link = e
                .links
                .iter()
                .find(|l| matches!(l.rel.as_deref(), None | Some("alternate")))
                .or_else(|| e.links.first())
                .map(|l| l.href.as_str())
                .unwrap_or(&e.id);
            let url = resolve(link)?.to_string();
            let title = e
                .title
                .as_ref()
                .map(|t| t.content.trim().to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| url.clone());
            let published_at = e.published.or(e.updated).map(|d| d.timestamp_millis());
            Some(FeedEntry {
                url,
                title,
                published_at,
            })
        })
        .collect();
    if entries.is_empty() {
        return Err(ScrapeError::NoFeed);
    }
    // Stable, and undated posts sort last, so a feed with no dates keeps the
    // order it came in.
    entries.sort_by_key(|e| std::cmp::Reverse(e.published_at));

    let site_url = feed
        .links
        .iter()
        .find(|l| matches!(l.rel.as_deref(), None | Some("alternate")))
        .and_then(|l| resolve(&l.href))
        .or_else(|| Url::parse(&feed_url.origin().ascii_serialization()).ok())
        .map(|u| u.to_string());
    let title = feed
        .title
        .map(|t| t.content.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| feed_url.host_str().unwrap_or("Blog").to_string());
    Ok(FoundFeed {
        feed_url: feed_url.to_string(),
        site_url,
        title,
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    const RSS: &str = r#"<?xml version="1.0"?><rss version="2.0"><channel>
        <title>My Blog</title><link>https://blog.dev/</link>
        <item><title><![CDATA[Old <b>post</b>]]></title><guid>https://blog.dev/old</guid>
          <link>https://blog.dev/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
        <item><title>New post</title><link>https://blog.dev/new</link>
          <pubDate>Tue, 02 Jan 2024 10:00:00 GMT</pubDate></item>
        </channel></rss>"#;

    #[test]
    fn finds_rss_and_atom_links_and_resolves_relative_ones() {
        let html = r#"<head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml">
            <link rel="ALTERNATE" type="application/atom+xml" href="https://x.dev/atom">
            <link rel="stylesheet" href="/a.css"></head>"#;
        let links = feed_links_in(html, &url("https://x.dev/posts/1"));
        assert_eq!(
            links,
            vec![url("https://x.dev/feed.xml"), url("https://x.dev/atom")]
        );
    }

    #[test]
    fn puts_a_comments_feed_after_the_main_one() {
        let html = r#"<head>
            <link rel="alternate" type="application/rss+xml" title="Comments on Post" href="/post/feed/">
            <link rel="alternate" type="application/rss+xml" title="Blog" href="/feed/"></head>"#;
        let links = feed_links_in(html, &url("https://x.dev/post"));
        assert_eq!(links[0], url("https://x.dev/feed/"));
        assert_eq!(links.len(), 2);
    }

    #[test]
    fn finds_no_links_on_a_page_without_any() {
        assert!(feed_links_in("<html><head></head></html>", &url("https://x.dev/")).is_empty());
    }

    #[test]
    fn knows_the_feed_of_substack_and_medium() {
        let feed = |p: &str| platform_feed(&url(p)).map(|u| u.to_string());
        assert_eq!(
            feed("https://foo.substack.com/p/bar?x=1").as_deref(),
            Some("https://foo.substack.com/feed")
        );
        assert_eq!(
            feed("https://medium.com/@jo/hello-123").as_deref(),
            Some("https://medium.com/feed/@jo")
        );
        assert_eq!(
            feed("https://medium.com/netflix-techblog/hello").as_deref(),
            Some("https://medium.com/feed/netflix-techblog")
        );
        assert_eq!(
            feed("https://jo.medium.com/hello").as_deref(),
            Some("https://jo.medium.com/feed")
        );
        assert_eq!(feed("https://example.com/hello"), None);
    }

    #[test]
    fn recognises_feeds_and_rejects_html() {
        assert!(looks_like_feed(
            "\u{feff}<?xml version=\"1.0\"?>\n<!-- hi -->\n<rss version=\"2.0\">"
        ));
        assert!(looks_like_feed(
            "<feed xmlns=\"http://www.w3.org/2005/Atom\">"
        ));
        assert!(!looks_like_feed(
            "<!DOCTYPE html><html><body>Not found</body></html>"
        ));
    }

    #[test]
    fn reads_an_rss_feed_newest_first() {
        let feed = parse_feed(RSS, &url("https://blog.dev/feed")).unwrap();
        assert_eq!(feed.title, "My Blog");
        assert_eq!(feed.site_url.as_deref(), Some("https://blog.dev/"));
        let urls: Vec<_> = feed.entries.iter().map(|e| e.url.as_str()).collect();
        assert_eq!(urls, ["https://blog.dev/new", "https://blog.dev/old"]);
        assert!(feed.entries[1].title.contains("Old"));
        assert!(feed.entries[0].published_at > feed.entries[1].published_at);
    }

    #[test]
    fn resolves_a_relative_atom_link() {
        let atom = r#"<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title>A</title><id>x</id><updated>2024-01-01T00:00:00Z</updated>
            <entry><title>One</title><id>1</id><updated>2024-01-01T00:00:00Z</updated>
              <link rel="alternate" href="/posts/one"/></entry></feed>"#;
        let feed = parse_feed(atom, &url("https://a.dev/atom.xml")).unwrap();
        assert_eq!(feed.entries[0].url, "https://a.dev/posts/one");
    }

    #[test]
    fn keeps_the_feed_order_when_there_are_no_dates() {
        let rss = r#"<rss version="2.0"><channel><title>T</title>
            <item><title>First</title><link>https://a.dev/1</link></item>
            <item><title>Second</title><link>https://a.dev/2</link></item></channel></rss>"#;
        let feed = parse_feed(rss, &url("https://a.dev/feed")).unwrap();
        assert_eq!(feed.entries[0].url, "https://a.dev/1");
        assert_eq!(feed.entries[1].url, "https://a.dev/2");
    }

    /// A tiny local server answering by path (404 for any other), so
    /// discovery is tested without a network.
    async fn serve(routes: Vec<(&'static str, &'static str)>) -> String {
        let routes: HashMap<_, _> = routes.into_iter().collect();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let routes = routes.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
                    let (status, body) = match routes.get(path.as_str()) {
                        Some(body) => ("200 OK", *body),
                        None => ("404 Not Found", "nope"),
                    };
                    let head = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    let _ = socket.write_all(body.as_bytes()).await;
                });
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn discovers_a_feed_from_the_page_link_tag() {
        let base = serve(vec![
            (
                "/post",
                r#"<link rel="alternate" type="application/rss+xml" href="/custom">"#,
            ),
            ("/custom", RSS),
        ])
        .await;
        let found = discover(&format!("{base}/post")).await.unwrap();
        assert_eq!(found.feed_url, format!("{base}/custom"));
        assert_eq!(found.entries.len(), 2);
    }

    #[tokio::test]
    async fn discovers_a_feed_advertised_only_on_the_homepage() {
        let base = serve(vec![
            ("/post", "<p>no link here</p>"),
            (
                "/",
                r#"<link rel="alternate" type="application/atom+xml" href="/a">"#,
            ),
            ("/a", RSS),
        ])
        .await;
        let found = discover(&format!("{base}/post")).await.unwrap();
        assert_eq!(found.feed_url, format!("{base}/a"));
    }

    #[tokio::test]
    async fn probes_past_a_feed_path_that_serves_html() {
        let base = serve(vec![
            ("/post", "<p>nothing</p>"),
            ("/feed", "<html>soft 404</html>"),
            ("/index.xml", RSS),
        ])
        .await;
        let found = discover(&format!("{base}/post")).await.unwrap();
        assert_eq!(found.feed_url, format!("{base}/index.xml"));
    }

    #[tokio::test]
    async fn reports_no_feed_when_the_site_has_none() {
        let base = serve(vec![("/post", "<p>nothing</p>")]).await;
        let err = discover(&format!("{base}/post")).await.unwrap_err();
        assert!(matches!(err, ScrapeError::NoFeed));
    }
}

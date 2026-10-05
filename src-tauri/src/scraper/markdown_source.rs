//! Docs sites built with Mintlify, GitBook, VitePress, and similar
//! generators often publish the raw Markdown source of a page alongside
//! its rendered HTML (usually at the same path plus `.md`). GitHub `blob`
//! URLs have an equivalent on `raw.githubusercontent.com`. Fetching that
//! directly and parsing it with `pulldown-cmark` is faster and far more
//! faithful than scraping the rendered HTML, so `scrape()` tries this
//! before the normal HTML pipeline. Silently falls through (returns
//! `None`) when no candidate exists or none of them look like Markdown —
//! nothing that works today regresses.

use std::time::Duration;

use once_cell::sync::Lazy;
use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use regex::Regex;
use url::Url;

use super::blocks::{clean_heading, merge_adjacent, trim_trailing_newlines, Block, ListItem, Span};
use super::lang_detect::detect_language;
use super::{now_millis, ScrapedArticle};

/// Below this the response is probably a "soft 404" stub or an empty file,
/// not real content.
const MIN_BODY_LEN: usize = 40;

/// Tries every raw-Markdown candidate for `canonical` and returns the first
/// one that fetches and looks like real Markdown, parsed into blocks.
pub async fn try_fetch(client: &reqwest::Client, canonical: &Url) -> Option<ScrapedArticle> {
    for candidate in candidate_urls(canonical) {
        let Some((_, markdown)) = fetch_markdown(client, candidate.as_str()).await else {
            continue;
        };
        let mut blocks = markdown_to_blocks(&markdown);
        if blocks.is_empty() {
            continue;
        }
        let title = extract_title(&mut blocks, canonical);
        return Some(ScrapedArticle {
            // The page itself, not the raw file: that is what the reader
            // links to and what a re-fetch should read.
            url: canonical.to_string(),
            canonical_url: canonical.to_string(),
            title,
            // A bare Markdown file carries no byline/date/site metadata the
            // way an HTML page's meta tags or JSON-LD would.
            author: None,
            site: canonical.host_str().unwrap_or("unknown").to_string(),
            published_at: None,
            blocks,
            scraped_at: now_millis(),
        });
    }
    None
}

/// Raw-Markdown URLs worth trying for a page, most specific first.
fn candidate_urls(canonical: &Url) -> Vec<Url> {
    [github_raw_url(canonical), path_plus_md(canonical)]
        .into_iter()
        .flatten()
        .collect()
}

/// `github.com/{owner}/{repo}/blob/{branch}/{path}` -> the same file on
/// `raw.githubusercontent.com`, which serves the file exactly as committed.
fn github_raw_url(url: &Url) -> Option<Url> {
    if url.host_str()? != "github.com" {
        return None;
    }
    let segments: Vec<&str> = url.path_segments()?.collect();
    if segments.len() < 5 || segments[2] != "blob" {
        return None;
    }
    let (owner, repo, branch) = (segments[0], segments[1], segments[3]);
    let rest = segments[4..].join("/");
    Url::parse(&format!(
        "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{rest}"
    ))
    .ok()
}

/// Many docs generators (Mintlify, GitBook, VitePress, plain Docusaurus)
/// serve a page's Markdown source at the same path with `.md` appended.
/// Skipped when the path already names a file extension, or is empty/root.
fn path_plus_md(url: &Url) -> Option<Url> {
    let path = url.path();
    if path.is_empty() || path == "/" || path.ends_with(".md") {
        return None;
    }
    let last_segment = path.rsplit('/').next().unwrap_or("");
    if last_segment.contains('.') {
        return None; // already has an extension (.html, .json, an image, ...)
    }
    let mut candidate = url.clone();
    candidate.set_path(&format!("{}.md", path.trim_end_matches('/')));
    Some(candidate)
}

/// Fetches one candidate with a short timeout (this is a speculative probe,
/// tried before the real fetch) and checks it actually looks like Markdown
/// rather than an HTML page (including a "soft 404" that returns 200 with
/// an HTML shell for any path).
async fn fetch_markdown(client: &reqwest::Client, url: &str) -> Option<(String, String)> {
    let response = client
        .get(url)
        .header("Accept", "text/markdown, text/plain, */*;q=0.5")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_ascii_lowercase);
    let final_url = response.url().to_string();
    let body = response.text().await.ok()?;
    looks_like_markdown(content_type.as_deref(), &body).then_some((final_url, body))
}

fn looks_like_markdown(content_type: Option<&str>, body: &str) -> bool {
    if content_type.is_some_and(|c| c.starts_with("text/html")) {
        return false;
    }
    if body.trim().len() < MIN_BODY_LEN {
        return false;
    }
    let head: String = body
        .chars()
        .take(200)
        .collect::<String>()
        .to_ascii_lowercase();
    !head.contains("<!doctype") && !head.contains("<html")
}

/// A bare Markdown file's title is its leading `# Heading` — searched for in
/// the first few blocks, not strictly the first one, since some generators
/// (Mintlify, for one) put a callout or image before the real heading.
/// Falls back to the URL's last path segment, then the host.
const TITLE_SEARCH_WINDOW: usize = 6;

fn extract_title(blocks: &mut Vec<Block>, canonical: &Url) -> String {
    let found = blocks
        .iter()
        .take(TITLE_SEARCH_WINDOW)
        .position(|b| matches!(b, Block::Heading { level: 1, .. }));
    if let Some(index) = found {
        let Block::Heading { text, .. } = blocks.remove(index) else {
            unreachable!()
        };
        return text;
    }
    canonical
        .path_segments()
        .and_then(|mut s| s.next_back())
        .filter(|s| !s.is_empty())
        .map(titleize_slug)
        .unwrap_or_else(|| canonical.host_str().unwrap_or("unknown").to_string())
}

/// "getting-started.md" -> "Getting Started": drops a trailing Markdown
/// extension and capitalizes each hyphen/underscore-separated word.
fn titleize_slug(segment: &str) -> String {
    let stem = segment
        .strip_suffix(".md")
        .or_else(|| segment.strip_suffix(".markdown"))
        .unwrap_or(segment);
    stem.split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn parser_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_GFM);
    // Docs generators (VitePress, Astro Starlight, and others) prepend a
    // YAML frontmatter block (`---\nurl: ...\n---`) to the raw file. Without
    // this, pulldown-cmark has no idea what it is and it leaks into the
    // article as stray paragraphs and horizontal rules. With it enabled,
    // frontmatter becomes a `MetadataBlock` tag, which the generic
    // `Event::Start(_) => skip_block` fallback in `markdown_to_blocks`
    // already drops cleanly.
    options.insert(Options::ENABLE_YAML_STYLE_METADATA_BLOCKS);
    options
}

/// Some sites (Better Stack's raw Markdown, for one) write an image's size
/// after its URL, `![alt](url =2400x1260)`. That is not CommonMark, so the
/// parser would show the whole thing as text instead of an image; drop the
/// size so it parses as a normal image.
static IMAGE_SIZE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(!\[[^\]]*\]\([^)\s]+)\s+=(?:\d+x?\d*|x\d+)\)").expect("valid regex")
});

/// Walks a Markdown document into our `Block` list, mirroring the shape
/// `blocks::html_to_blocks` produces from HTML (nested lists flattened with
/// a `depth`, headings collapsed to plain text, standalone images promoted
/// out of their paragraph) so both pipelines are interchangeable to callers.
pub fn markdown_to_blocks(markdown: &str) -> Vec<Block> {
    let markdown = IMAGE_SIZE_RE.replace_all(markdown, "$1)");
    let mut iter = Parser::new_ext(&markdown, parser_options());
    let mut blocks = Vec::new();
    while let Some(event) = iter.next() {
        match event {
            Event::Start(Tag::Paragraph) => consume_paragraph(&mut iter, &mut blocks),
            Event::Start(Tag::Heading { level, .. }) => {
                consume_heading(&mut iter, level, &mut blocks)
            }
            Event::Start(Tag::BlockQuote(_)) => consume_quote(&mut iter, &mut blocks),
            Event::Start(Tag::CodeBlock(kind)) => consume_code_block(&mut iter, kind, &mut blocks),
            Event::Start(Tag::List(start)) => consume_list(&mut iter, start.is_some(), &mut blocks),
            Event::Start(Tag::Table(_)) => consume_table(&mut iter, &mut blocks),
            // Raw HTML blocks, footnotes, definition lists and anything
            // else we don't model: drop, but consume so the stream stays
            // balanced for what follows.
            Event::Start(_) => skip_block(&mut iter),
            _ => {}
        }
    }
    blocks
}

/// Consumes events until the balanced close of a tag whose `Start` was
/// already taken (depth starts at 1 for that open tag).
fn skip_block<'a>(iter: &mut impl Iterator<Item = Event<'a>>) {
    let mut depth = 1;
    for event in iter.by_ref() {
        match event {
            Event::Start(_) => depth += 1,
            Event::End(_) => {
                depth -= 1;
                if depth == 0 {
                    return;
                }
            }
            _ => {}
        }
    }
}

/// Plain text content of a tag (no formatting kept), for headings and table
/// cells — matches `blocks::collect_text`'s behaviour on the HTML side.
fn collect_plain_text<'a>(iter: &mut impl Iterator<Item = Event<'a>>, end: TagEnd) -> String {
    let mut text = String::new();
    let mut depth = 0i32;
    for event in iter.by_ref() {
        match event {
            Event::End(e) => {
                if e == end && depth == 0 {
                    break;
                }
                depth -= 1;
            }
            Event::Start(_) => depth += 1,
            Event::Text(t) | Event::Code(t) => text.push_str(&t),
            Event::SoftBreak => text.push(' '),
            Event::HardBreak => text.push('\n'),
            _ => {}
        }
    }
    text
}

/// One already-taken inline event, appending to `out` with the current
/// formatting; recurses for nested emphasis/strong/link/image. Mirrors
/// `blocks::collect_spans_inner`'s shape for the HTML side.
fn handle_inline_event<'a>(
    event: Event<'a>,
    iter: &mut impl Iterator<Item = Event<'a>>,
    bold: bool,
    italic: bool,
    code: bool,
    href: Option<String>,
    out: &mut Vec<Span>,
) {
    match event {
        Event::Text(t) => out.push(Span {
            text: t.into_string(),
            bold,
            italic,
            code,
            href,
        }),
        Event::Code(t) => out.push(Span {
            text: t.into_string(),
            bold,
            italic,
            code: true,
            href,
        }),
        Event::SoftBreak => out.push(Span::plain(" ".to_string())),
        Event::HardBreak => out.push(Span::plain("\n".to_string())),
        Event::Start(Tag::Emphasis) => {
            collect_inline(iter, TagEnd::Emphasis, bold, true, code, href, out)
        }
        Event::Start(Tag::Strong) => {
            collect_inline(iter, TagEnd::Strong, true, italic, code, href, out)
        }
        Event::Start(Tag::Link { dest_url, .. }) => collect_inline(
            iter,
            TagEnd::Link,
            bold,
            italic,
            code,
            Some(dest_url.into_string()),
            out,
        ),
        // An image mixed into a heading/quote/list item/table cell: no
        // standalone Image block makes sense there, so keep its alt text.
        Event::Start(Tag::Image { .. }) => {
            let alt = collect_plain_text(iter, TagEnd::Image);
            if !alt.trim().is_empty() {
                out.push(Span {
                    text: alt,
                    bold,
                    italic,
                    code,
                    href,
                });
            }
        }
        Event::Start(_) => skip_block(iter),
        _ => {}
    }
}

fn collect_inline<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    stop: TagEnd,
    bold: bool,
    italic: bool,
    code: bool,
    href: Option<String>,
    out: &mut Vec<Span>,
) {
    while let Some(event) = iter.next() {
        if let Event::End(e) = &event {
            if *e == stop {
                return;
            }
        }
        handle_inline_event(event, iter, bold, italic, code, href.clone(), out);
    }
}

/// A paragraph's only content being a single image is how CommonMark
/// represents `![alt](src)` on its own line; promoted to a standalone
/// `Block::Image` (matching what the HTML pipeline does via its image
/// placeholder mechanism, see `images.rs`), with any surrounding text in
/// the same paragraph flushed as `Block::Paragraph`s around it.
fn consume_paragraph<'a>(iter: &mut impl Iterator<Item = Event<'a>>, out: &mut Vec<Block>) {
    let mut spans: Vec<Span> = Vec::new();
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(TagEnd::Paragraph)) => break,
            Some(Event::Start(Tag::Image { dest_url, .. })) => {
                let alt = collect_plain_text(iter, TagEnd::Image);
                flush_paragraph(std::mem::take(&mut spans), out);
                out.push(Block::Image {
                    src: dest_url.into_string(),
                    alt: (!alt.trim().is_empty()).then(|| alt.trim().to_string()),
                });
            }
            Some(event) => handle_inline_event(event, iter, false, false, false, None, &mut spans),
        }
    }
    flush_paragraph(spans, out);
}

fn flush_paragraph(spans: Vec<Span>, out: &mut Vec<Block>) {
    let spans = merge_adjacent(spans);
    if spans.iter().any(|s| !s.text.trim().is_empty()) {
        out.push(Block::Paragraph { spans });
    }
}

fn consume_heading<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    level: HeadingLevel,
    out: &mut Vec<Block>,
) {
    let text = clean_heading(&collect_plain_text(iter, TagEnd::Heading(level)));
    if !text.is_empty() {
        out.push(Block::Heading {
            level: level as u8,
            text,
        });
    }
}

fn consume_quote<'a>(iter: &mut impl Iterator<Item = Event<'a>>, out: &mut Vec<Block>) {
    let mut spans = Vec::new();
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(TagEnd::BlockQuote(_))) => break,
            Some(Event::Start(Tag::Paragraph)) => {
                collect_inline(
                    iter,
                    TagEnd::Paragraph,
                    false,
                    false,
                    false,
                    None,
                    &mut spans,
                );
                spans.push(Span::plain("\n".to_string()));
            }
            Some(event) => handle_inline_event(event, iter, false, false, false, None, &mut spans),
        }
    }
    let spans = trim_trailing_newlines(merge_adjacent(spans));
    if spans.iter().any(|s| !s.text.trim().is_empty()) {
        out.push(Block::Quote { spans });
    }
}

fn consume_code_block<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    kind: CodeBlockKind,
    out: &mut Vec<Block>,
) {
    let declared = match &kind {
        CodeBlockKind::Fenced(lang) if !lang.trim().is_empty() => Some(lang.trim().to_string()),
        _ => None,
    };
    let content = collect_plain_text(iter, TagEnd::CodeBlock)
        .trim_end_matches('\n')
        .to_string();
    if content.trim().is_empty() {
        return;
    }
    let language = declared.or_else(|| detect_language(&content));
    out.push(Block::Code { language, content });
}

fn consume_list<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    ordered: bool,
    out: &mut Vec<Block>,
) {
    let mut items = Vec::new();
    collect_list_items(iter, 0, &mut items);
    if !items.is_empty() {
        out.push(Block::List { ordered, items });
    }
}

/// Flattens a list (and any nested lists inside its items) into `items`,
/// recording nesting depth — the same shape `blocks::collect_list_items`
/// builds from HTML, including the single `ordered` flag coming only from
/// the outermost list.
fn collect_list_items<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    depth: u8,
    items: &mut Vec<ListItem>,
) {
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(TagEnd::List(_))) => break,
            Some(Event::Start(Tag::Item)) => consume_item(iter, depth, items),
            _ => {}
        }
    }
}

fn consume_item<'a>(
    iter: &mut impl Iterator<Item = Event<'a>>,
    depth: u8,
    items: &mut Vec<ListItem>,
) {
    let mut spans = Vec::new();
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(TagEnd::Item)) => break,
            Some(Event::Start(Tag::Paragraph)) => collect_inline(
                iter,
                TagEnd::Paragraph,
                false,
                false,
                false,
                None,
                &mut spans,
            ),
            Some(Event::Start(Tag::List(_))) => {
                let flushed = merge_adjacent(std::mem::take(&mut spans));
                if flushed.iter().any(|s| !s.text.trim().is_empty()) {
                    items.push(ListItem {
                        spans: flushed,
                        depth,
                    });
                }
                collect_list_items(iter, depth.saturating_add(1), items);
            }
            Some(event) => handle_inline_event(event, iter, false, false, false, None, &mut spans),
        }
    }
    let spans = merge_adjacent(spans);
    if spans.iter().any(|s| !s.text.trim().is_empty()) {
        items.push(ListItem { spans, depth });
    }
}

fn consume_table<'a>(iter: &mut impl Iterator<Item = Event<'a>>, out: &mut Vec<Block>) {
    let mut header = Vec::new();
    let mut rows = Vec::new();
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(TagEnd::Table)) => break,
            Some(Event::Start(Tag::TableHead)) => {
                header = consume_table_row(iter, TagEnd::TableHead)
            }
            Some(Event::Start(Tag::TableRow)) => {
                rows.push(consume_table_row(iter, TagEnd::TableRow))
            }
            _ => {}
        }
    }
    if !header.is_empty() || !rows.is_empty() {
        out.push(Block::Table { header, rows });
    }
}

fn consume_table_row<'a>(iter: &mut impl Iterator<Item = Event<'a>>, end: TagEnd) -> Vec<String> {
    let mut cells = Vec::new();
    loop {
        match iter.next() {
            None => break,
            Some(Event::End(e)) if e == end => break,
            Some(Event::Start(Tag::TableCell)) => {
                let text = collect_plain_text(iter, TagEnd::TableCell);
                cells.push(text.split_whitespace().collect::<Vec<_>>().join(" "));
            }
            _ => {}
        }
    }
    cells
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn github_blob_urls_map_to_raw_githubusercontent() {
        let raw = github_raw_url(&url(
            "https://github.com/rust-lang/rust/blob/master/README.md",
        ))
        .unwrap();
        assert_eq!(
            raw.as_str(),
            "https://raw.githubusercontent.com/rust-lang/rust/master/README.md"
        );
        assert!(github_raw_url(&url("https://github.com/rust-lang/rust")).is_none());
        assert!(github_raw_url(&url("https://example.dev/blob/x")).is_none());
    }

    #[test]
    fn path_plus_md_skips_urls_that_already_have_an_extension_or_are_root() {
        assert_eq!(
            path_plus_md(&url("https://docs.example.dev/guide/intro"))
                .unwrap()
                .as_str(),
            "https://docs.example.dev/guide/intro.md"
        );
        assert!(path_plus_md(&url("https://example.dev/")).is_none());
        assert!(path_plus_md(&url("https://example.dev/page.html")).is_none());
        assert!(path_plus_md(&url("https://example.dev/already.md")).is_none());
    }

    #[test]
    fn rejects_an_html_shell_masquerading_as_markdown() {
        assert!(!looks_like_markdown(
            Some("text/html; charset=utf-8"),
            "# Real markdown but wrong content-type"
        ));
        assert!(!looks_like_markdown(
            None,
            "<!doctype html><html><body>soft 404</body></html>"
        ));
        assert!(!looks_like_markdown(Some("text/plain"), "hi"));
        assert!(looks_like_markdown(
            Some("text/plain; charset=utf-8"),
            "# A real page\n\nWith enough content to pass the length check."
        ));
    }

    #[test]
    fn parses_headings_paragraphs_and_inline_formatting() {
        let blocks = markdown_to_blocks(
            "# Title\n\nHello **bold** and *italic* and `code`, see [a link](https://x.dev).",
        );
        assert_eq!(
            blocks[0],
            Block::Heading {
                level: 1,
                text: "Title".into()
            }
        );
        let Block::Paragraph { spans } = &blocks[1] else {
            panic!("expected a paragraph, got {:?}", blocks[1]);
        };
        assert!(spans.iter().any(|s| s.bold && s.text == "bold"));
        assert!(spans.iter().any(|s| s.italic && s.text == "italic"));
        assert!(spans.iter().any(|s| s.code && s.text == "code"));
        assert!(spans
            .iter()
            .any(|s| s.href.as_deref() == Some("https://x.dev")));
    }

    #[test]
    fn promotes_a_standalone_image_out_of_its_paragraph() {
        let blocks =
            markdown_to_blocks("Some text.\n\n![a diagram](https://x.dev/d.png)\n\nMore text.");
        assert_eq!(
            blocks,
            vec![
                Block::Paragraph {
                    spans: vec![Span::plain("Some text.".into())]
                },
                Block::Image {
                    src: "https://x.dev/d.png".into(),
                    alt: Some("a diagram".into())
                },
                Block::Paragraph {
                    spans: vec![Span::plain("More text.".into())]
                },
            ]
        );
    }

    #[test]
    fn an_image_with_a_size_suffix_is_still_an_image() {
        let blocks =
            markdown_to_blocks("![og.jpg](https://cdn.x.dev/9d7a/orig =2400x1260)\n\nText.");
        assert_eq!(
            blocks[0],
            Block::Image {
                src: "https://cdn.x.dev/9d7a/orig".into(),
                alt: Some("og.jpg".into())
            }
        );
    }

    #[test]
    fn nested_lists_flatten_with_depth_like_the_html_pipeline() {
        let blocks = markdown_to_blocks("- one\n  - nested\n- two\n");
        let Block::List { ordered, items } = &blocks[0] else {
            panic!("expected a list");
        };
        assert!(!ordered);
        let shape: Vec<(String, u8)> = items
            .iter()
            .map(|i| (i.spans.iter().map(|s| s.text.as_str()).collect(), i.depth))
            .collect();
        assert_eq!(
            shape,
            vec![
                ("one".to_string(), 0),
                ("nested".to_string(), 1),
                ("two".to_string(), 0),
            ]
        );
    }

    #[test]
    fn fenced_code_keeps_the_declared_language_and_drops_the_trailing_newline() {
        let blocks = markdown_to_blocks("```rust\nfn main() {}\n```\n");
        assert_eq!(
            blocks[0],
            Block::Code {
                language: Some("rust".into()),
                content: "fn main() {}".into()
            }
        );
    }

    #[test]
    fn detects_language_for_an_unlabelled_fence() {
        let blocks = markdown_to_blocks("```\ndef main():\n    print(\"hi\")\n```\n");
        let Block::Code { language, .. } = &blocks[0] else {
            panic!("expected code");
        };
        assert_eq!(language.as_deref(), Some("python"));
    }

    #[test]
    fn blockquotes_join_multiple_paragraphs_with_newlines() {
        let blocks = markdown_to_blocks("> First line.\n>\n> Second line.\n");
        let Block::Quote { spans } = &blocks[0] else {
            panic!("expected a quote");
        };
        let text: String = spans.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(text, "First line.\nSecond line.");
    }

    #[test]
    fn parses_a_gfm_table() {
        let blocks = markdown_to_blocks("| Name | Type |\n| --- | --- |\n| id | u64 |\n");
        assert_eq!(
            blocks[0],
            Block::Table {
                header: vec!["Name".into(), "Type".into()],
                rows: vec![vec!["id".into(), "u64".into()]],
            }
        );
    }

    #[test]
    fn raw_html_blocks_are_dropped_without_corrupting_what_follows() {
        let blocks = markdown_to_blocks(
            "<div align=\"center\">\n<img src=\"x.png\">\n</div>\n\nReal paragraph.",
        );
        assert_eq!(blocks.len(), 1);
        assert_eq!(
            blocks[0],
            Block::Paragraph {
                spans: vec![Span::plain("Real paragraph.".into())]
            }
        );
    }

    #[test]
    fn extract_title_promotes_the_leading_h1_or_falls_back_to_the_url() {
        let mut blocks = vec![
            Block::Heading {
                level: 1,
                text: "My Page".into(),
            },
            Block::Paragraph { spans: vec![] },
        ];
        assert_eq!(
            extract_title(&mut blocks, &url("https://x.dev/p")),
            "My Page"
        );
        assert_eq!(blocks.len(), 1); // the heading was removed

        let mut no_heading = vec![Block::Paragraph { spans: vec![] }];
        assert_eq!(
            extract_title(&mut no_heading, &url("https://x.dev/getting-started")),
            "Getting Started"
        );
    }

    #[test]
    fn finds_a_title_heading_preceded_by_a_preamble_callout() {
        // Mintlify's raw .md puts an index/callout blockquote before the
        // real `# Quickstart` heading.
        let mut blocks = vec![
            Block::Quote {
                spans: vec![Span::plain("See the index.".into())],
            },
            Block::Heading {
                level: 1,
                text: "Quickstart".into(),
            },
            Block::Paragraph { spans: vec![] },
        ];
        assert_eq!(
            extract_title(&mut blocks, &url("https://x.dev/docs/quickstart")),
            "Quickstart"
        );
        // The preamble stays; only the heading itself is removed.
        assert_eq!(blocks.len(), 2);
        assert!(matches!(blocks[0], Block::Quote { .. }));
    }

    #[test]
    fn a_heading_beyond_the_search_window_does_not_count_as_the_title() {
        let filler = || Block::Paragraph {
            spans: vec![Span::plain("x".into())],
        };
        let mut blocks: Vec<Block> = (0..TITLE_SEARCH_WINDOW).map(|_| filler()).collect();
        blocks.push(Block::Heading {
            level: 1,
            text: "Too Late".into(),
        });
        assert_eq!(
            extract_title(&mut blocks, &url("https://x.dev/fallback-name")),
            "Fallback Name"
        );
    }

    #[test]
    fn strips_yaml_frontmatter_instead_of_leaking_it_into_the_article() {
        let blocks = markdown_to_blocks(
            "---\nurl: /guide.md\ntitle: Getting Started\n---\n\n# Getting Started\n\nReal content.",
        );
        assert_eq!(
            blocks,
            vec![
                Block::Heading {
                    level: 1,
                    text: "Getting Started".into()
                },
                Block::Paragraph {
                    spans: vec![Span::plain("Real content.".into())]
                },
            ]
        );
    }
}

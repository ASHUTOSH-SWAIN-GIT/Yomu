//! Site specific content selectors. Readability guesses the main content,
//! which works on blogs but misfires on docs frameworks (mdBook currently
//! fails outright). These frameworks mark their content element clearly,
//! so when we recognise one we take that element directly.
//!
//! Detection is by marker element rather than hostname, so self hosted
//! docs sites are covered too.

use scraper::{Html, Selector};

/// Where a framework keeps the article's real title.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TitleSource {
    /// The first `h1` inside the content element (most docs frameworks).
    ContentH1,
    /// The first `h1` on the page, which sits outside the content (dev.to).
    PageH1,
    /// The `<title>` tag minus its " - Site name" suffix. mdBook renders
    /// the chapter title only there; its only `h1` is the book title.
    TitleTag,
}

pub struct Extracted {
    pub html: String,
    pub title_source: TitleSource,
}

/// `(selector, title source)`. The first selector that matches an element
/// with enough text wins. Order goes from most to least specific.
const RULES: &[(&str, TitleSource)] = &[
    (".theme-doc-markdown", TitleSource::ContentH1), // Docusaurus
    (".md-content__inner", TitleSource::ContentH1),  // MkDocs Material
    (".td-content", TitleSource::ContentH1),         // Hugo Docsy (kubernetes.io)
    ("#article-body", TitleSource::PageH1),          // dev.to
    ("#mw-content-text .mw-parser-output", TitleSource::PageH1), // Wikipedia / MediaWiki
    ("#mdbook-content main, #content main", TitleSource::TitleTag), // mdBook
];

/// Below this the match is probably a stub (e.g. an empty container), so
/// fall back to Readability.
const MIN_TEXT_CHARS: usize = 200;

/// Returns the site's content element, if this page matches a known docs
/// framework.
pub fn extract_content(document: &Html) -> Option<Extracted> {
    RULES.iter().find_map(|(selector, title_source)| {
        let selector = Selector::parse(selector).ok()?;
        let el = document.select(&selector).next()?;
        let text_len: usize = el.text().map(|t| t.trim().len()).sum();
        (text_len >= MIN_TEXT_CHARS).then(|| Extracted {
            html: el.inner_html(),
            title_source: *title_source,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn long() -> String {
        "word ".repeat(80)
    }

    #[test]
    fn picks_mdbook_content() {
        let html = format!(
            r#"<nav>menu</nav><div id="mdbook-content"><main><h1>Ch</h1><p>{}</p></main></div>"#,
            long()
        );
        let doc = Html::parse_document(&html);
        let content = extract_content(&doc)
            .expect("mdbook rule should match")
            .html;
        assert!(content.contains("<h1>Ch</h1>"));
        assert!(!content.contains("menu"));
    }

    #[test]
    fn picks_docsy_content() {
        let html = format!(r#"<div class="td-content"><p>{}</p></div>"#, long());
        assert!(extract_content(&Html::parse_document(&html)).is_some());
    }

    #[test]
    fn ignores_stub_containers_and_unknown_pages() {
        let stub = r#"<div class="td-content"><p>tiny</p></div>"#;
        assert!(extract_content(&Html::parse_document(stub)).is_none());
        let plain = format!("<article><p>{}</p></article>", long());
        assert!(extract_content(&Html::parse_document(&plain)).is_none());
    }
}

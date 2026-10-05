use scraper::{Html, Selector};

/// Best effort author extraction from the original page `<head>`.
/// Readability's `Product` doesn't carry byline info, so we look at the
/// common meta tag conventions ourselves before content is stripped.
pub fn extract_author(document: &Html) -> Option<String> {
    let candidates: &[(&str, &str)] = &[
        ("meta[name=\"author\"]", "content"),
        ("meta[property=\"article:author\"]", "content"),
        ("meta[name=\"twitter:creator\"]", "content"),
    ];

    for (selector_str, attr) in candidates {
        if let Ok(selector) = Selector::parse(selector_str) {
            if let Some(el) = document.select(&selector).next() {
                if let Some(value) = el.value().attr(attr) {
                    let value = value.trim();
                    if !value.is_empty() {
                        return Some(value.trim_start_matches('@').to_string());
                    }
                }
            }
        }
    }

    None
}

/// The page's logo: the largest icon it declares in `<head>`, preferring a
/// touch icon (a large square logo) over a favicon. Resolved against the
/// page address; `None` when it declares none.
pub fn extract_icon(document: &Html, base: &url::Url) -> Option<String> {
    let selector = Selector::parse("link[rel][href]").ok()?;
    let mut best: Option<(u32, String)> = None;
    for link in document.select(&selector) {
        let rel = link.value().attr("rel")?.to_lowercase();
        let touch = rel.contains("apple-touch-icon");
        if !(touch || rel.split_whitespace().any(|t| t == "icon")) {
            continue;
        }
        let href = link.value().attr("href")?.trim();
        if href.is_empty() || href.starts_with("data:") {
            continue;
        }
        let Ok(resolved) = base.join(href) else {
            continue;
        };
        if !matches!(resolved.scheme(), "http" | "https") {
            continue;
        }
        // "180x180" counts as 180; "any" (a scalable icon) as 64.
        let size = link
            .value()
            .attr("sizes")
            .map(|s| {
                s.split_whitespace()
                    .map(|part| {
                        if part == "any" {
                            64
                        } else {
                            part.split('x')
                                .next()
                                .and_then(|n| n.parse().ok())
                                .unwrap_or(0)
                        }
                    })
                    .max()
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        let score = if touch { 1000 } else { 0 } + size;
        if best.as_ref().is_none_or(|(s, _)| score > *s) {
            best = Some((score, resolved.to_string()));
        }
    }
    best.map(|(_, url)| url)
}

/// Page title for pages we extract ourselves (see rules.rs). Prefers the
/// first `h1`, since `<title>` on docs sites carries a "- Site Name" suffix.
pub fn extract_title(document: &Html) -> Option<String> {
    for (selector, attr) in [
        ("h1", None),
        ("meta[property=\"og:title\"]", Some("content")),
        ("title", None),
    ] {
        let Ok(selector) = Selector::parse(selector) else {
            continue;
        };
        if let Some(el) = document.select(&selector).next() {
            let text = match attr {
                Some(a) => el.value().attr(a).unwrap_or("").to_string(),
                None => el.text().collect::<String>(),
            };
            let text = super::blocks::clean_heading(&text);
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    None
}

/// Readability's title is the raw `<title>`, which often carries site
/// noise ("Medium" prefix, "| by Author | Sep 2026 | Medium"). When the
/// page's `og:title` is contained in it, that's the clean article title.
/// It only ever trims: an og:title that isn't part of the title is ignored.
pub fn clean_title(document: &Html, raw: &str) -> String {
    let og = Selector::parse("meta[property=\"og:title\"]")
        .ok()
        .and_then(|sel| document.select(&sel).next())
        .and_then(|el| el.value().attr("content"))
        .map(super::blocks::clean_heading)
        .filter(|t| !t.is_empty());
    match og {
        Some(og) if raw.contains(og.as_str()) => og,
        _ => raw.to_string(),
    }
}

/// The `<title>` without its trailing " - Site" / " | Site" suffix.
pub fn extract_title_tag(document: &Html) -> Option<String> {
    let selector = Selector::parse("title").ok()?;
    let raw: String = document.select(&selector).next()?.text().collect();
    let raw = super::blocks::clean_heading(&raw);
    let title = [" - ", " | ", " \u{2013} "]
        .iter()
        .filter_map(|sep| raw.rsplit_once(sep).map(|(left, _)| left))
        .min_by_key(|left| left.len())
        .unwrap_or(&raw);
    (!title.is_empty()).then(|| title.to_string())
}

/// Best effort site name, falling back to the host if `og:site_name`
/// isn't present.
pub fn extract_site_name(document: &Html, host: &str) -> String {
    if let Ok(selector) = Selector::parse("meta[property=\"og:site_name\"]") {
        if let Some(el) = document.select(&selector).next() {
            if let Some(value) = el.value().attr("content") {
                let value = value.trim();
                if !value.is_empty() {
                    return value.to_string();
                }
            }
        }
    }
    host.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_author_meta_tag() {
        let html = r#"<html><head><meta name="author" content="Jane Doe"></head></html>"#;
        let doc = Html::parse_document(html);
        assert_eq!(extract_author(&doc), Some("Jane Doe".to_string()));
    }

    #[test]
    fn title_prefers_h1_over_title_tag() {
        let html = "<html><head><title>Ch 4 - The Book</title></head><body><h1> What is\n Ownership? </h1></body></html>";
        assert_eq!(
            extract_title(&Html::parse_document(html)),
            Some("What is Ownership?".to_string())
        );
    }

    #[test]
    fn title_tag_drops_site_suffix() {
        let doc = Html::parse_document(
            "<html><head><title>What is Ownership? - The Rust Programming Language</title></head></html>",
        );
        assert_eq!(
            extract_title_tag(&doc),
            Some("What is Ownership?".to_string())
        );
    }

    #[test]
    fn clean_title_trims_site_noise_using_og_title() {
        let doc =
            Html::parse_document(r#"<head><meta property="og:title" content="Why Rust?"></head>"#);
        assert_eq!(
            clean_title(&doc, "MediumWhy Rust? | by Ann | Sep, 2026 | Medium"),
            "Why Rust?"
        );
    }

    #[test]
    fn clean_title_ignores_an_unrelated_og_title() {
        let doc =
            Html::parse_document(r#"<head><meta property="og:title" content="Site name"></head>"#);
        assert_eq!(clean_title(&doc, "Real Article"), "Real Article");
        assert_eq!(
            clean_title(&Html::parse_document("<head></head>"), "T"),
            "T"
        );
    }

    #[test]
    fn falls_back_to_host_for_site_name() {
        let doc = Html::parse_document("<html><head></head></html>");
        assert_eq!(extract_site_name(&doc, "example.com"), "example.com");
    }
}

#[cfg(test)]
mod icon_tests {
    use super::*;

    fn icon(html: &str) -> Option<String> {
        let base = url::Url::parse("https://site.dev/blog/post").unwrap();
        extract_icon(&Html::parse_document(html), &base)
    }

    #[test]
    fn prefers_a_touch_icon_then_the_largest_icon() {
        let html = r#"<head>
            <link rel="icon" href="/f16.png" sizes="16x16">
            <link rel="icon" href="/f32.png" sizes="32x32">
            <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
        </head>"#;
        assert_eq!(icon(html).as_deref(), Some("https://site.dev/touch.png"));
        let html = r#"<head>
            <link rel="shortcut icon" href="/a.ico">
            <link rel="icon" href="/b.png" sizes="48x48">
        </head>"#;
        assert_eq!(icon(html).as_deref(), Some("https://site.dev/b.png"));
    }

    #[test]
    fn resolves_relative_addresses_and_skips_unusable_ones() {
        assert_eq!(
            icon(r#"<link rel="icon" href="../logo.svg">"#).as_deref(),
            Some("https://site.dev/logo.svg")
        );
        assert_eq!(
            icon(r#"<link rel="icon" href="data:image/png;base64,AAA">"#),
            None
        );
        assert_eq!(icon(r#"<link rel="mask-icon" href="/mask.svg">"#), None);
        assert_eq!(icon("<head></head>"), None);
    }
}

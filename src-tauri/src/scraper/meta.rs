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
    fn falls_back_to_host_for_site_name() {
        let doc = Html::parse_document("<html><head></head></html>");
        assert_eq!(extract_site_name(&doc, "example.com"), "example.com");
    }
}

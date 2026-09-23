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
    fn falls_back_to_host_for_site_name() {
        let doc = Html::parse_document("<html><head></head></html>");
        assert_eq!(extract_site_name(&doc, "example.com"), "example.com");
    }
}

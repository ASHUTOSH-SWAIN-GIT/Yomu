//! Detects a page whose full text a server withheld behind a paywall,
//! rather than one that genuinely has little content or failed to extract.
//! Same shape as `render::looks_like_bot_check`: a short list of phrases
//! real paywall banners use, checked case-insensitively. Best effort — a
//! site with wording we haven't seen is missed, same limitation as the
//! bot-check heuristic.

const MARKERS: [&str; 9] = [
    "for paying subscribers",
    "this post is for paid subscribers",
    "members only content",
    "sign up to continue reading",
    "subscribe to continue reading",
    "continue reading with a subscription",
    "you've reached your free article limit",
    "you have reached your free article limit",
    "this content is only available to subscribers",
];

pub fn looks_like_paywall(html: &str) -> bool {
    let lower = html.to_lowercase();
    MARKERS.iter().any(|marker| lower.contains(marker))
}

/// Whether the page carries the box a publisher puts where the free preview
/// ends (Substack: `div.paywall`). The text before it is all there is.
pub fn has_gate(document: &scraper::Html) -> bool {
    scraper::Selector::parse(".paywall, [data-component-name=\"Paywall\"]")
        .is_ok_and(|selector| document.select(&selector).next().is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_substack_paywall_box() {
        let gated = scraper::Html::parse_document(
            r#"<p>Free part</p><div class="paywall"><h2>This post is for paid subscribers</h2></div>"#,
        );
        assert!(has_gate(&gated));
        let open = scraper::Html::parse_document("<p>All of it</p>");
        assert!(!has_gate(&open));
    }

    #[test]
    fn detects_common_paywall_wording() {
        assert!(looks_like_paywall(
            "<p>This post is for paid subscribers.</p>"
        ));
        assert!(looks_like_paywall("<div>Sign up to continue reading</div>"));
        assert!(looks_like_paywall(
            "<b>You've reached your free article limit</b>"
        ));
    }

    #[test]
    fn is_case_insensitive() {
        assert!(looks_like_paywall("MEMBERS ONLY CONTENT"));
    }

    #[test]
    fn leaves_ordinary_articles_alone() {
        assert!(!looks_like_paywall(
            "<p>Subscribe to my newsletter for updates.</p>"
        ));
        assert!(!looks_like_paywall(
            "<h1>Understanding Ownership in Rust</h1>"
        ));
    }
}

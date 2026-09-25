//! Reads schema.org `Article`/`NewsArticle`/`BlogPosting` metadata from a
//! page's `<script type="application/ld+json">` tags. Far more sites embed
//! this correctly than set clean `<meta>` tags (dev.to, most news sites,
//! many blog platforms), so it's tried before the meta-tag guesses in
//! `meta.rs`. Best effort: absent, malformed, or unrelated JSON-LD (a site's
//! nav breadcrumbs, its logo, an unrelated schema type) is silently ignored.

use scraper::{Html, Selector};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ArticleMetadata {
    pub author: Option<String>,
    pub site_name: Option<String>,
    /// Unix milliseconds, from `datePublished` (falls back to `dateModified`).
    pub published_at: Option<u64>,
}

impl ArticleMetadata {
    fn is_empty(&self) -> bool {
        self.author.is_none() && self.site_name.is_none() && self.published_at.is_none()
    }

    fn merge(&mut self, other: ArticleMetadata) {
        self.author = self.author.take().or(other.author);
        self.site_name = self.site_name.take().or(other.site_name);
        self.published_at = self.published_at.take().or(other.published_at);
    }
}

/// A schema.org `author`/`publisher`: either a bare string, or an object
/// (`Person`/`Organization`) with a `name`. Sites use both forms.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum NameOrThing {
    Name(String),
    Thing {
        name: Option<String>,
    },
    /// `author` is sometimes an array of these (multiple bylines); we only
    /// want the first for a single display string.
    List(Vec<NameOrThing>),
}

impl NameOrThing {
    fn first_name(&self) -> Option<String> {
        match self {
            NameOrThing::Name(s) => Some(s.clone()),
            NameOrThing::Thing { name } => name.clone(),
            NameOrThing::List(items) => items.first().and_then(NameOrThing::first_name),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
struct SchemaArticle {
    #[serde(rename = "@type")]
    schema_type: Option<Value>,
    author: Option<NameOrThing>,
    publisher: Option<NameOrThing>,
    #[serde(rename = "datePublished")]
    date_published: Option<String>,
    #[serde(rename = "dateModified")]
    date_modified: Option<String>,
    /// `@graph` wrappers nest the real article node(s) here.
    #[serde(rename = "@graph")]
    graph: Option<Vec<SchemaArticle>>,
}

const ARTICLE_TYPES: [&str; 6] = [
    "Article",
    "NewsArticle",
    "BlogPosting",
    "TechArticle",
    "ScholarlyArticle",
    "Report",
];

/// `@type` is either a bare string or an array of strings (a node can claim
/// several types); true if any of them is an article-like type.
fn is_article_type(value: &Value) -> bool {
    match value {
        Value::String(s) => ARTICLE_TYPES.contains(&s.as_str()),
        Value::Array(items) => items.iter().any(is_article_type),
        _ => false,
    }
}

/// RFC 3339 date(-time), the format schema.org dates use. Accepts a
/// date-only value (`2024-01-02`) by treating it as UTC midnight.
fn parse_date(raw: &str) -> Option<u64> {
    let millis = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        dt.timestamp_millis()
    } else {
        chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
            .ok()?
            .and_hms_opt(0, 0, 0)?
            .and_utc()
            .timestamp_millis()
    };
    u64::try_from(millis).ok()
}

fn from_node(node: &SchemaArticle) -> ArticleMetadata {
    let mut found = ArticleMetadata {
        author: node.author.as_ref().and_then(NameOrThing::first_name),
        site_name: node.publisher.as_ref().and_then(NameOrThing::first_name),
        published_at: node
            .date_published
            .as_deref()
            .or(node.date_modified.as_deref())
            .and_then(parse_date),
    };
    let is_article = node.schema_type.as_ref().is_some_and(is_article_type);
    if !is_article {
        // Not an Article node itself (could be the page's Organization or
        // WebSite entry): only its @graph children, if any, count.
        found = ArticleMetadata::default();
    }
    for child in node.graph.iter().flatten() {
        found.merge(from_node(child));
    }
    found
}

/// Scans every JSON-LD block on the page for the first usable Article
/// metadata. A page can have several `<script>` tags (breadcrumbs, the
/// organization, the article); each is parsed independently, and a parse
/// failure or unrelated type in one never stops the others being checked.
pub fn extract(document: &Html) -> ArticleMetadata {
    let Ok(selector) = Selector::parse(r#"script[type="application/ld+json"]"#) else {
        return ArticleMetadata::default();
    };

    let mut result = ArticleMetadata::default();
    for script in document.select(&selector) {
        let text: String = script.text().collect();
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        // A top-level array of nodes, or a single node.
        let nodes: Vec<Value> = match value {
            Value::Array(items) => items,
            other => vec![other],
        };
        for node in nodes {
            if let Ok(article) = serde_json::from_value::<SchemaArticle>(node) {
                result.merge(from_node(&article));
            }
        }
        if !result.is_empty() && result.author.is_some() && result.published_at.is_some() {
            break; // enough to stop scanning further scripts
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(json: &str) -> Html {
        Html::parse_document(&format!(
            r#"<html><head><script type="application/ld+json">{json}</script></head></html>"#
        ))
    }

    #[test]
    fn reads_author_publisher_and_date_from_a_plain_article() {
        let meta = extract(&doc(
            r#"{"@type":"Article","author":{"@type":"Person","name":"Ada Lovelace"},
                "publisher":{"@type":"Organization","name":"dev.to"},
                "datePublished":"2026-09-06T05:01:14Z"}"#,
        ));
        assert_eq!(meta.author.as_deref(), Some("Ada Lovelace"));
        assert_eq!(meta.site_name.as_deref(), Some("dev.to"));
        assert!(meta.published_at.is_some());
    }

    #[test]
    fn accepts_a_bare_string_author_and_an_array_of_authors() {
        let meta = extract(&doc(r#"{"@type":"BlogPosting","author":"Jane Doe"}"#));
        assert_eq!(meta.author.as_deref(), Some("Jane Doe"));

        let meta = extract(&doc(
            r#"{"@type":"NewsArticle","author":[{"name":"First Author"},{"name":"Second"}]}"#,
        ));
        assert_eq!(meta.author.as_deref(), Some("First Author"));
    }

    #[test]
    fn looks_inside_a_graph_wrapper() {
        let meta = extract(&doc(r#"{"@context":"https://schema.org","@graph":[
                {"@type":"WebSite","name":"Example"},
                {"@type":"Article","author":{"name":"Grace Hopper"},"datePublished":"2024-01-02"}
            ]}"#));
        assert_eq!(meta.author.as_deref(), Some("Grace Hopper"));
        assert!(meta.published_at.is_some());
    }

    #[test]
    fn ignores_non_article_types_and_malformed_json() {
        let meta = extract(&doc(r#"{"@type":"Organization","name":"Not an article"}"#));
        assert_eq!(meta, ArticleMetadata::default());

        let meta = extract(&doc("{not valid json"));
        assert_eq!(meta, ArticleMetadata::default());
    }

    #[test]
    fn falls_back_to_date_modified_when_date_published_is_absent() {
        let meta = extract(&doc(
            r#"{"@type":"Article","dateModified":"2026-01-15T10:00:00Z"}"#,
        ));
        assert!(meta.published_at.is_some());
    }

    #[test]
    fn a_second_script_is_used_when_the_first_has_nothing_useful() {
        let html = r#"<html><head>
            <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
            <script type="application/ld+json">{"@type":"Article","author":"Ada"}</script>
        </head></html>"#;
        let meta = extract(&Html::parse_document(html));
        assert_eq!(meta.author.as_deref(), Some("Ada"));
    }

    #[test]
    fn missing_script_tag_yields_empty_metadata() {
        assert_eq!(
            extract(&Html::parse_document("<html></html>")),
            ArticleMetadata::default()
        );
    }
}

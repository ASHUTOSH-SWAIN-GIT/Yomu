use scraper::{ElementRef, Html, Node};
use serde::Serialize;

use super::lang_detect::detect_language;

/// A single formatted run of text inside a paragraph or heading.
/// Kept as structured data (never raw HTML) so the frontend can render
/// scraped, untrusted content without `dangerouslySetInnerHTML`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub text: String,
    #[serde(skip_serializing_if = "is_false")]
    pub bold: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub italic: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub code: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

impl Span {
    fn plain(text: String) -> Self {
        Span {
            text,
            bold: false,
            italic: false,
            code: false,
            href: None,
        }
    }
}

/// One block of article content. Mirrors the block JSON format in ROADMAP.md.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Block {
    Heading {
        level: u8,
        text: String,
    },
    Paragraph {
        spans: Vec<Span>,
    },
    Code {
        language: Option<String>,
        content: String,
    },
    Image {
        src: String,
        alt: Option<String>,
    },
    Math {
        tex: String,
    },
}

/// Walks cleaned article HTML (already run through Readability) and turns
/// it into a flat list of blocks. Nested containers (div, section, article)
/// are flattened; only leaf block-level elements produce a `Block`.
pub fn html_to_blocks(html: &str) -> Vec<Block> {
    let document = Html::parse_fragment(html);
    let mut blocks = Vec::new();
    walk_children(document.root_element(), &mut blocks);
    blocks
}

fn walk_children(el: ElementRef, blocks: &mut Vec<Block>) {
    for child in el.children() {
        if let Some(child_el) = ElementRef::wrap(child) {
            walk_element(child_el, blocks);
        }
    }
}

fn walk_element(el: ElementRef, blocks: &mut Vec<Block>) {
    let tag = el.value().name();

    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level = tag[1..].parse().unwrap_or(2);
            let text = collect_text(el);
            if !text.trim().is_empty() {
                blocks.push(Block::Heading {
                    level,
                    text: text.trim().to_string(),
                });
            }
        }
        "p" | "blockquote" => {
            let spans = collect_spans(el);
            if spans.iter().any(|s| !s.text.trim().is_empty()) {
                blocks.push(Block::Paragraph { spans });
            }
        }
        "li" => {
            let mut spans = vec![Span::plain("\u{2022} ".to_string())];
            spans.extend(collect_spans(el));
            if spans.iter().any(|s| !s.text.trim().is_empty()) {
                blocks.push(Block::Paragraph { spans });
            }
        }
        "pre" => {
            let code_el = el
                .children()
                .filter_map(ElementRef::wrap)
                .find(|c| c.value().name() == "code")
                .unwrap_or(el);
            let content = collect_text(code_el);
            if !content.trim().is_empty() {
                let declared = code_el
                    .value()
                    .attr("class")
                    .and_then(extract_language_from_class);
                let language = declared.or_else(|| detect_language(&content));
                blocks.push(Block::Code { language, content });
            }
        }
        "img" => {
            if let Some(src) = el.value().attr("src") {
                blocks.push(Block::Image {
                    src: src.to_string(),
                    alt: el.value().attr("alt").map(|s| s.to_string()),
                });
            }
        }
        "annotation" if el.value().attr("encoding") == Some("application/x-tex") => {
            let tex = collect_text(el);
            if !tex.trim().is_empty() {
                blocks.push(Block::Math {
                    tex: tex.trim().to_string(),
                });
            }
        }
        // Containers: recurse without emitting a block of their own.
        "div" | "section" | "article" | "ul" | "ol" | "figure" | "main" | "body" | "html"
        | "span" => {
            walk_children(el, blocks);
        }
        // Skip non-content elements entirely.
        "script" | "style" | "nav" | "header" | "footer" | "aside" | "form" | "svg" => {}
        _ => {
            walk_children(el, blocks);
        }
    }
}

/// Collects the visible text of an element, ignoring child element structure.
fn collect_text(el: ElementRef) -> String {
    el.text().collect::<Vec<_>>().join("")
}

/// Turns the inline children of a paragraph-like element into spans,
/// preserving bold, italic, inline code and links.
fn collect_spans(el: ElementRef) -> Vec<Span> {
    let mut spans = Vec::new();
    collect_spans_inner(el, false, false, false, None, &mut spans);
    merge_adjacent(spans)
}

fn collect_spans_inner(
    el: ElementRef,
    bold: bool,
    italic: bool,
    code: bool,
    href: Option<String>,
    out: &mut Vec<Span>,
) {
    for child in el.children() {
        match child.value() {
            Node::Text(text) => {
                let text = text.to_string();
                if !text.is_empty() {
                    out.push(Span {
                        text,
                        bold,
                        italic,
                        code,
                        href: href.clone(),
                    });
                }
            }
            Node::Element(elem) => {
                let Some(child_el) = ElementRef::wrap(child) else {
                    continue;
                };
                match elem.name() {
                    "strong" | "b" => {
                        collect_spans_inner(child_el, true, italic, code, href.clone(), out)
                    }
                    "em" | "i" => {
                        collect_spans_inner(child_el, bold, true, code, href.clone(), out)
                    }
                    "code" => collect_spans_inner(child_el, bold, italic, true, href.clone(), out),
                    "a" => {
                        let link = elem.attr("href").map(|s| s.to_string()).or(href.clone());
                        collect_spans_inner(child_el, bold, italic, code, link, out)
                    }
                    "br" => out.push(Span::plain("\n".to_string())),
                    "script" | "style" => {}
                    _ => collect_spans_inner(child_el, bold, italic, code, href.clone(), out),
                }
            }
            _ => {}
        }
    }
}

/// Collapses consecutive spans that share the same formatting, which keeps
/// output tidy when the source HTML wraps text in extra inline elements.
fn merge_adjacent(spans: Vec<Span>) -> Vec<Span> {
    let mut merged: Vec<Span> = Vec::with_capacity(spans.len());
    for span in spans {
        if let Some(last) = merged.last_mut() {
            if last.bold == span.bold
                && last.italic == span.italic
                && last.code == span.code
                && last.href == span.href
            {
                last.text.push_str(&span.text);
                continue;
            }
        }
        merged.push(span);
    }
    merged
}

/// Highlight.js / Shiki style `class="language-yaml"` or `class="lang-yaml"`.
fn extract_language_from_class(class: &str) -> Option<String> {
    class.split_whitespace().find_map(|token| {
        token
            .strip_prefix("language-")
            .or_else(|| token.strip_prefix("lang-"))
            .map(|s| s.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_heading_and_paragraph() {
        let html = r#"
            <div>
                <h2>Getting started</h2>
                <p>Install <code>kubectl</code> and run <a href="https://k8s.io">the docs</a>.</p>
            </div>
        "#;
        let blocks = html_to_blocks(html);
        assert_eq!(
            blocks[0],
            Block::Heading {
                level: 2,
                text: "Getting started".to_string()
            }
        );
        let Block::Paragraph { spans } = &blocks[1] else {
            panic!("expected paragraph");
        };
        assert!(spans.iter().any(|s| s.code && s.text == "kubectl"));
        assert!(spans
            .iter()
            .any(|s| s.href.as_deref() == Some("https://k8s.io")));
    }

    #[test]
    fn extracts_code_block_with_declared_language() {
        let html = r#"<pre><code class="language-yaml">apiVersion: v1
kind: Pod</code></pre>"#;
        let blocks = html_to_blocks(html);
        assert_eq!(
            blocks[0],
            Block::Code {
                language: Some("yaml".to_string()),
                content: "apiVersion: v1\nkind: Pod".to_string(),
            }
        );
    }

    #[test]
    fn detects_language_when_not_declared() {
        let html = "<pre><code>def main():\n    print(\"hi\")</code></pre>";
        let blocks = html_to_blocks(html);
        let Block::Code { language, .. } = &blocks[0] else {
            panic!("expected code block");
        };
        assert_eq!(language.as_deref(), Some("python"));
    }

    #[test]
    fn extracts_image() {
        let html = r#"<img src="https://example.com/a.png" alt="diagram">"#;
        let blocks = html_to_blocks(html);
        assert_eq!(
            blocks[0],
            Block::Image {
                src: "https://example.com/a.png".to_string(),
                alt: Some("diagram".to_string()),
            }
        );
    }

    #[test]
    fn flattens_list_items_into_paragraphs() {
        let html = "<ul><li>First</li><li>Second</li></ul>";
        let blocks = html_to_blocks(html);
        assert_eq!(blocks.len(), 2);
        for block in &blocks {
            assert!(matches!(block, Block::Paragraph { .. }));
        }
    }

    #[test]
    fn skips_script_and_style_tags() {
        let html = "<div><script>alert(1)</script><style>.a{}</style><p>Real content</p></div>";
        let blocks = html_to_blocks(html);
        assert_eq!(blocks.len(), 1);
        assert!(matches!(blocks[0], Block::Paragraph { .. }));
    }
}

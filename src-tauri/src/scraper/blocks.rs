use scraper::{ElementRef, Html, Node};
use serde::Serialize;

use super::images::{is_decorative_image, pick_image_url, pick_picture_url};
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
    pub(super) fn plain(text: String) -> Self {
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
    List {
        ordered: bool,
        items: Vec<ListItem>,
    },
    Quote {
        spans: Vec<Span>,
    },
    Table {
        /// Empty when the table has no header row.
        header: Vec<String>,
        rows: Vec<Vec<String>>,
    },
}

/// One list entry. Nested lists are flattened into the same list with a
/// larger `depth`, which keeps the block format simple to render.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListItem {
    pub spans: Vec<Span>,
    pub depth: u8,
}

/// Walks cleaned article HTML (already run through Readability) and turns
/// it into a flat list of blocks. Nested containers (div, section, article)
/// are flattened; only leaf block-level elements produce a `Block`.
#[cfg(test)]
pub fn html_to_blocks(html: &str) -> Vec<Block> {
    html_to_blocks_with_base(html, None)
}

/// Like [`html_to_blocks`], resolving image URLs against `base` (the page
/// URL) so relative and protocol-relative `src`s become absolute.
pub fn html_to_blocks_with_base(html: &str, base: Option<&url::Url>) -> Vec<Block> {
    let document = Html::parse_fragment(html);
    let mut blocks = Vec::new();
    walk_children(document.root_element(), base, &mut blocks);
    blocks
}

fn walk_children(el: ElementRef, base: Option<&url::Url>, blocks: &mut Vec<Block>) {
    for child in el.children() {
        if let Some(child_el) = ElementRef::wrap(child) {
            walk_element(child_el, base, blocks);
        }
    }
}

fn walk_element(el: ElementRef, base: Option<&url::Url>, blocks: &mut Vec<Block>) {
    let tag = el.value().name();

    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level = tag[1..].parse().unwrap_or(2);
            let text = clean_heading(&collect_text(el));
            if !text.is_empty() {
                blocks.push(Block::Heading { level, text });
            }
        }
        "p" => {
            let spans = collect_spans(el);
            if spans.iter().any(|s| !s.text.trim().is_empty()) {
                blocks.push(Block::Paragraph { spans });
            }
        }
        "blockquote" => {
            let spans = trim_trailing_newlines(collect_spans(el));
            if spans.iter().any(|s| !s.text.trim().is_empty()) {
                blocks.push(Block::Quote { spans });
            }
        }
        "ul" | "ol" => {
            let mut items = Vec::new();
            collect_list_items(el, 0, &mut items);
            if !items.is_empty() {
                blocks.push(Block::List {
                    ordered: tag == "ol",
                    items,
                });
            }
        }
        "table" => {
            if let Some(table) = table_block(el) {
                blocks.push(table);
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
            if !is_decorative_image(el) {
                if let Some(src) = pick_image_url(el, base) {
                    blocks.push(Block::Image {
                        src,
                        alt: el
                            .value()
                            .attr("alt")
                            .map(str::trim)
                            .filter(|a| !a.is_empty())
                            .map(str::to_string),
                    });
                }
            }
        }
        "picture" => {
            // Sources first: the fallback `img` is often empty (Medium).
            let img = el
                .descendants()
                .filter_map(ElementRef::wrap)
                .find(|e| e.value().name() == "img");
            if !img.is_some_and(is_decorative_image) {
                if let Some(src) = pick_picture_url(el, base) {
                    blocks.push(Block::Image {
                        src,
                        alt: img
                            .and_then(|i| i.value().attr("alt"))
                            .map(str::trim)
                            .filter(|a| !a.is_empty())
                            .map(str::to_string),
                    });
                }
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
        "div" | "section" | "article" | "figure" | "main" | "body" | "html" | "span" => {
            walk_children(el, base, blocks);
        }
        // Skip non-content elements entirely.
        "script" | "style" | "nav" | "header" | "footer" | "aside" | "form" | "svg" => {}
        _ => {
            walk_children(el, base, blocks);
        }
    }
}

/// Collapses whitespace and drops the permalink glyphs docs frameworks
/// append to headings (MkDocs "¶", "#" anchors, zero width spaces).
pub(super) fn clean_heading(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .trim_end_matches(['\u{b6}', '#', '\u{200b}', ' '])
        .to_string()
}

/// Flattens a `ul`/`ol` (and any lists nested inside its items) into
/// `items`, recording nesting depth. An item's own text excludes its nested
/// lists, which become separate deeper items.
fn collect_list_items(list: ElementRef, depth: u8, items: &mut Vec<ListItem>) {
    for child in list.children().filter_map(ElementRef::wrap) {
        if child.value().name() != "li" {
            continue;
        }
        let spans = trim_trailing_newlines(collect_spans(child));
        if spans.iter().any(|s| !s.text.trim().is_empty()) {
            items.push(ListItem { spans, depth });
        }
        for nested in child.children().filter_map(ElementRef::wrap) {
            if matches!(nested.value().name(), "ul" | "ol") {
                collect_list_items(nested, depth.saturating_add(1), items);
            }
        }
    }
}

fn cell_text(cell: ElementRef) -> String {
    collect_text(cell)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Turns a `table` into a header plus rows of plain text cells. The header
/// is the first row if it is in a `thead` or made of `th` cells.
fn table_block(table: ElementRef) -> Option<Block> {
    let mut rows: Vec<(bool, Vec<String>)> = Vec::new();
    for row in table
        .descendants()
        .filter_map(ElementRef::wrap)
        .filter(|e| e.value().name() == "tr")
    {
        let cells: Vec<ElementRef> = row
            .children()
            .filter_map(ElementRef::wrap)
            .filter(|c| matches!(c.value().name(), "th" | "td"))
            .collect();
        if cells.is_empty() {
            continue;
        }
        let is_header = cells.iter().all(|c| c.value().name() == "th");
        rows.push((is_header, cells.into_iter().map(cell_text).collect()));
    }

    let header = match rows.first() {
        Some((true, _)) => rows.remove(0).1,
        _ => Vec::new(),
    };
    let rows: Vec<Vec<String>> = rows.into_iter().map(|(_, cells)| cells).collect();
    if header.is_empty() && rows.is_empty() {
        return None;
    }
    Some(Block::Table { header, rows })
}

pub(super) fn trim_trailing_newlines(mut spans: Vec<Span>) -> Vec<Span> {
    while let Some(last) = spans.last_mut() {
        let trimmed = last.text.trim_end_matches('\n').len();
        last.text.truncate(trimmed);
        if last.text.is_empty() {
            spans.pop();
        } else {
            break;
        }
    }
    spans
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
                    // Nested lists are emitted as their own deeper items
                    // (see `collect_list_items`).
                    "ul" | "ol" | "script" | "style" => {}
                    // Paragraphs inside a blockquote or list item.
                    "p" => {
                        if out.last().is_some_and(|l| !l.text.ends_with('\n')) {
                            out.push(Span::plain("\n".to_string()));
                        }
                        collect_spans_inner(child_el, bold, italic, code, href.clone(), out);
                        out.push(Span::plain("\n".to_string()));
                    }
                    _ => collect_spans_inner(child_el, bold, italic, code, href.clone(), out),
                }
            }
            _ => {}
        }
    }
}

/// Collapses consecutive spans that share the same formatting, which keeps
/// output tidy when the source HTML wraps text in extra inline elements.
pub(super) fn merge_adjacent(spans: Vec<Span>) -> Vec<Span> {
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
    fn heading_drops_permalink_glyphs() {
        let blocks =
            html_to_blocks(r##"<h2>Getting started<a class="headerlink" href="#x">¶</a></h2>"##);
        assert_eq!(
            blocks[0],
            Block::Heading {
                level: 2,
                text: "Getting started".to_string()
            }
        );
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

    fn images(html: &str, base: &str) -> Vec<String> {
        let base = url::Url::parse(base).unwrap();
        html_to_blocks_with_base(html, Some(&base))
            .into_iter()
            .filter_map(|b| match b {
                Block::Image { src, .. } => Some(src),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn resolves_relative_and_protocol_relative_image_urls() {
        let html = r#"<img src="/images/pod.svg"><img src="//cdn.example.com/x.png"><img src="../up.png"><img src="rel.png">"#;
        assert_eq!(
            images(html, "https://site.dev/docs/guide/page.html"),
            vec![
                "https://site.dev/images/pod.svg",
                "https://cdn.example.com/x.png",
                "https://site.dev/docs/up.png",
                "https://site.dev/docs/guide/rel.png",
            ]
        );
    }

    #[test]
    fn prefers_the_largest_srcset_candidate() {
        let html =
            r#"<img src="small.jpg" srcset="a-480.jpg 480w, a-1080.jpg 1080w, a-720.jpg 720w">"#;
        assert_eq!(
            images(html, "https://x.dev/p/"),
            vec!["https://x.dev/p/a-1080.jpg"]
        );
    }

    #[test]
    fn finds_lazy_loaded_images_behind_placeholders() {
        let placeholder =
            "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        let html = format!(r#"<img src="{placeholder}" data-src="/real.jpg">"#);
        assert_eq!(
            images(&html, "https://x.dev/"),
            vec!["https://x.dev/real.jpg"]
        );
        // A placeholder with nothing better is dropped, not shown as a blank.
        let only = format!(r#"<img src="{placeholder}">"#);
        assert!(images(&only, "https://x.dev/").is_empty());
    }

    #[test]
    fn keeps_real_embedded_data_uris_but_not_other_schemes() {
        let long = format!("data:image/png;base64,{}", "A".repeat(400));
        let html = format!(
            r#"<img src="{long}"><img src="javascript:alert(1)"><img src="file:///etc/passwd">"#
        );
        assert_eq!(images(&html, "https://x.dev/"), vec![long]);
    }

    #[test]
    fn skips_ui_chrome_but_keeps_content_images() {
        let html = r#"
            <img src="/i/copycode.svg" class="icon-copycode" onclick="copyCode()">
            <img src="/i/logo.svg" width="32" height="32">
            <img src="/i/avatar.png" class="user-avatar">
            <img src="/i/spacer.gif" aria-hidden="true">
            <img src="/i/medium-photo.jpg" role="presentation" alt="">
            <img src="/i/diagram.svg" alt="Pod creation diagram">
            <img src="/i/photo.jpg" width="800" height="600">"#;
        assert_eq!(
            images(html, "https://x.dev/"),
            vec![
                "https://x.dev/i/medium-photo.jpg",
                "https://x.dev/i/diagram.svg",
                "https://x.dev/i/photo.jpg"
            ]
        );
    }

    #[test]
    fn picture_element_uses_its_sources_when_the_img_has_no_src() {
        // Shape taken from a real Medium page.
        let html = r#"<figure><picture><source srcset="https://cdn.x/a-640.webp 640w, https://cdn.x/a-1400.webp 1400w"><img alt="Fig 1" width="700" height="317" role="presentation"></picture></figure>"#;
        let blocks = html_to_blocks(html);
        assert_eq!(
            blocks,
            vec![Block::Image {
                src: "https://cdn.x/a-1400.webp".into(),
                alt: Some("Fig 1".into())
            }]
        );
    }

    #[test]
    fn empty_alt_becomes_none() {
        let blocks = html_to_blocks(r#"<img src="https://x.dev/a.png" alt="  ">"#);
        assert_eq!(
            blocks[0],
            Block::Image {
                src: "https://x.dev/a.png".into(),
                alt: None
            }
        );
    }

    #[test]
    fn keeps_lists_as_lists_with_nesting() {
        let html = "<ol><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol>";
        let blocks = html_to_blocks(html);
        let [Block::List { ordered, items }] = blocks.as_slice() else {
            panic!("expected one list, got {blocks:?}");
        };
        assert!(*ordered);
        let texts: Vec<(String, u8)> = items
            .iter()
            .map(|i| (i.spans.iter().map(|s| s.text.as_str()).collect(), i.depth))
            .collect();
        assert_eq!(
            texts,
            vec![
                ("First".to_string(), 0),
                ("Nested".to_string(), 1),
                ("Second".to_string(), 0)
            ]
        );
    }

    #[test]
    fn keeps_blockquotes_as_quotes() {
        let html = "<blockquote><p>One</p><p>Two</p></blockquote>";
        let blocks = html_to_blocks(html);
        let [Block::Quote { spans }] = blocks.as_slice() else {
            panic!("expected one quote, got {blocks:?}");
        };
        let text: String = spans.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(text, "One\nTwo");
    }

    #[test]
    fn extracts_table_with_header() {
        let html = "<table><thead><tr><th>Name</th><th>Type</th></tr></thead>\
            <tbody><tr><td>id</td><td> u64 </td></tr></tbody></table>";
        let blocks = html_to_blocks(html);
        assert_eq!(
            blocks,
            vec![Block::Table {
                header: vec!["Name".into(), "Type".into()],
                rows: vec![vec!["id".into(), "u64".into()]],
            }]
        );
    }

    #[test]
    fn table_without_header_row_keeps_all_rows() {
        let blocks = html_to_blocks("<table><tr><td>a</td><td>b</td></tr></table>");
        assert_eq!(
            blocks,
            vec![Block::Table {
                header: vec![],
                rows: vec![vec!["a".into(), "b".into()]],
            }]
        );
    }

    #[test]
    fn skips_script_and_style_tags() {
        let html = "<div><script>alert(1)</script><style>.a{}</style><p>Real content</p></div>";
        let blocks = html_to_blocks(html);
        assert_eq!(blocks.len(), 1);
        assert!(matches!(blocks[0], Block::Paragraph { .. }));
    }
}

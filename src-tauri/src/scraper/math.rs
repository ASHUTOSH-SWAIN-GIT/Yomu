//! Math that the page leaves for the browser to typeset.
//!
//! Pandoc (`--mathjax`) writes `<span class="math inline">\(C\)</span>` and
//! `<span class="math display">\[ ... \]</span>`; MathJax v2 pages keep the
//! TeX in `<script type="math/tex">`. Neither is rendered in the fetched
//! HTML, so the reader gets the TeX and typesets it itself (KaTeX).

use std::borrow::Cow;

use once_cell::sync::Lazy;
use regex::{Captures, Regex};
use scraper::ElementRef;

use super::blocks::{collect_text, push_paragraph, Block, Span};

/// One formula found in the page.
pub(super) struct Formula {
    /// TeX without its delimiters.
    pub tex: String,
    /// Display math sits on its own line; inline math runs in the prose.
    pub display: bool,
}

fn has_class(el: ElementRef, name: &str) -> bool {
    el.value()
        .attr("class")
        .is_some_and(|c| c.split_whitespace().any(|c| c == name))
}

/// The TeX of a Pandoc/MathJax math element, if `el` is one.
pub(super) fn formula(el: ElementRef) -> Option<Formula> {
    if !has_class(el, "math") {
        return None;
    }
    // MathJax v2 rewrites a Pandoc span in place and nests the source in a
    // `script[type="math/tex"]` (see `scripts_to_spans`): that one is the TeX.
    if let Some(inner) = el
        .descendants()
        .skip(1)
        .filter_map(ElementRef::wrap)
        .find(|d| has_class(*d, "math"))
    {
        return formula(inner);
    }
    let (tex, delimited_display) = strip_delimiters(&collect_text(el))?;
    Some(Formula {
        tex,
        display: delimited_display || has_class(el, "display"),
    })
}

/// Removes `\( \)`, `\[ \]`, `$ $` or `$$ $$` around TeX and says whether
/// they were display delimiters. Bare TeX (no delimiters) is returned as is.
/// `None` when nothing is left.
fn strip_delimiters(raw: &str) -> Option<(String, bool)> {
    let raw = raw.trim();
    let pairs: [(&str, &str, bool); 4] = [
        ("\\(", "\\)", false),
        ("\\[", "\\]", true),
        ("$$", "$$", true),
        ("$", "$", false),
    ];
    let (inner, display) = pairs
        .iter()
        .find_map(|(open, close, display)| {
            let inner = raw.strip_prefix(open)?.strip_suffix(close)?;
            Some((inner, *display))
        })
        .unwrap_or((raw, false));
    let tex = inner.trim();
    (!tex.is_empty()).then(|| (tex.to_string(), display))
}

/// What MathJax itself leaves in an already rendered page: a preview, the
/// typeset glyphs and an assistive copy. All of it repeats the TeX, so none
/// of it is article text.
pub(super) fn is_rendered_mathjax(el: ElementRef) -> bool {
    const CLASSES: &[&str] = &[
        "MathJax_Preview",
        "MathJax",
        "MathJax_Display",
        "MathJax_Processing",
        "MathJax_Error",
        "MJX_Assistive_MathML",
        "MJX_Assistive_MathML_Block",
    ];
    matches!(el.value().name(), "mjx-container" | "mjx-assistive-mml")
        || CLASSES.iter().any(|c| has_class(el, c))
}

static SCRIPT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<script\b[^>]*\btype\s*=\s*["']?math/tex([^"'>]*)["']?[^>]*>(.*?)</script>"#)
        .expect("valid regex")
});

/// Rewrites MathJax v2 `<script type="math/tex">` sources as Pandoc-style
/// math spans. Readability deletes scripts, so this runs on the page before
/// it. `type="math/tex; mode=display"` is display math.
pub(super) fn scripts_to_spans(html: &str) -> Cow<'_, str> {
    SCRIPT_RE.replace_all(html, |caps: &Captures| {
        let display = caps[1].contains("mode=display");
        let tex = caps[2]
            .trim()
            .trim_start_matches("<![CDATA[")
            .trim_end_matches("]]>")
            .trim()
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        let (kind, open, close) = if display {
            ("display", "\\[", "\\]")
        } else {
            ("inline", "\\(", "\\)")
        };
        format!(r#"<span class="math {kind}">{open}{tex}{close}</span>"#)
    })
}

// Readability keeps only text: it drops `class`, so a `span.math` comes back
// as the bare TeX in the prose. Like images (see `images.rs`), formulas are
// wrapped in private-use marks before Readability and turned back into math
// afterwards. The mark carries the kind (`d`isplay or `i`nline) and the TeX.
const OPEN: char = '\u{E001}';
const CLOSE: char = '\u{E002}';

static MATH_SPAN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?is)<(?:span|div)\b[^>]*\bclass\s*=\s*"(?:[^"]*\s)?math(\s[^"]*)?"[^>]*>([^<]*)</(?:span|div)>"#,
    )
    .expect("valid regex")
});
static PREVIEW_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<span\b[^>]*\bclass\s*=\s*"[^"]*MathJax_Preview[^"]*"[^>]*>[^<]*</span>"#)
        .expect("valid regex")
});
static MARK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(&format!("(?s){OPEN}([di])(.*?){CLOSE}")).expect("valid regex"));

/// Replaces each `span.math` (Pandoc's markup, see the module docs) in the
/// page with a mark, and drops MathJax's preview copies of the same TeX.
/// Run after `scripts_to_spans`.
pub(super) fn tokenize(html: &str) -> String {
    let html = PREVIEW_RE.replace_all(html, "");
    MATH_SPAN_RE
        .replace_all(&html, |caps: &Captures| {
            let classes = caps.get(1).map_or("", |m| m.as_str());
            match strip_delimiters(&caps[2]) {
                Some((tex, delimited)) => {
                    let display = delimited || classes.split_whitespace().any(|c| c == "display");
                    format!("{OPEN}{}{tex}{CLOSE}", if display { 'd' } else { 'i' })
                }
                None => String::new(),
            }
        })
        .into_owned()
}

/// Turns the marks in `spans` back into math spans; prose around a mark
/// keeps the formatting of the span it was in.
fn expand(spans: Vec<Span>) -> Vec<Span> {
    let mut out = Vec::with_capacity(spans.len());
    for span in spans {
        if !span.text.contains(OPEN) {
            out.push(span);
            continue;
        }
        let mut at = 0;
        for m in MARK_RE.captures_iter(&span.text) {
            let whole = m.get(0).expect("whole match");
            if whole.start() > at {
                out.push(Span {
                    text: span.text[at..whole.start()].to_string(),
                    ..span.clone()
                });
            }
            out.push(Span {
                text: m[2].trim().to_string(),
                code: false,
                math: true,
                display: &m[1] == "d",
                ..span.clone()
            });
            at = whole.end();
        }
        if at < span.text.len() {
            out.push(Span {
                text: span.text[at..].to_string(),
                ..span
            });
        }
    }
    out
}

/// Marks left in text that cannot show math (a heading, a table cell) become
/// the plain TeX.
fn unmark(text: &str) -> String {
    MARK_RE.replace_all(text, "$2").into_owned()
}

/// Puts math back into the blocks Readability produced: inline formulas
/// become math spans, and display formulas in a paragraph become blocks.
pub(super) fn restore(blocks: Vec<Block>) -> Vec<Block> {
    let mut out = Vec::with_capacity(blocks.len());
    for block in blocks {
        match block {
            Block::Paragraph { spans } => push_paragraph(expand(spans), &mut out),
            Block::Quote { spans } => out.push(Block::Quote {
                spans: expand(spans),
            }),
            Block::List { ordered, mut items } => {
                for item in &mut items {
                    item.spans = expand(std::mem::take(&mut item.spans));
                }
                out.push(Block::List { ordered, items });
            }
            Block::Heading { level, text } => out.push(Block::Heading {
                level,
                text: unmark(&text),
            }),
            Block::Table { header, rows } => out.push(Block::Table {
                header: header.iter().map(|c| unmark(c)).collect(),
                rows: rows
                    .iter()
                    .map(|r| r.iter().map(|c| unmark(c)).collect())
                    .collect(),
            }),
            other => out.push(other),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_every_delimiter_style() {
        assert_eq!(strip_delimiters(r"\(C\)"), Some(("C".into(), false)));
        assert_eq!(strip_delimiters(r"\[ x \]"), Some(("x".into(), true)));
        assert_eq!(strip_delimiters("$$x$$"), Some(("x".into(), true)));
        assert_eq!(strip_delimiters(" $x$ "), Some(("x".into(), false)));
        assert_eq!(
            strip_delimiters(r"\frac{1}{2}"),
            Some((r"\frac{1}{2}".into(), false))
        );
        assert_eq!(strip_delimiters(r"\(  \)"), None);
        assert_eq!(strip_delimiters("   "), None);
    }

    #[test]
    fn mathjax_v2_scripts_become_math_spans() {
        let html = r#"<p>a <script type="math/tex">x < y &amp; z</script> b
            <script type="math/tex; mode=display">\int_0^1 f</script></p><script>var x = 1;</script>"#;
        let out = scripts_to_spans(html);
        assert!(
            out.contains(r#"<span class="math inline">\(x &lt; y &amp;amp; z\)</span>"#),
            "{out}"
        );
        assert!(
            out.contains(r#"<span class="math display">\[\int_0^1 f\]</span>"#),
            "{out}"
        );
        assert!(out.contains("var x = 1;"), "other scripts are left alone");
    }

    #[test]
    fn pages_without_math_scripts_are_untouched() {
        let html = "<p>no math</p><script>1</script>";
        assert!(matches!(scripts_to_spans(html), Cow::Borrowed(_)));
    }

    #[test]
    fn tokenize_then_restore_round_trips_formulas() {
        let marked = tokenize(
            r#"<p>a <span class="math inline">\(x &lt; y\)</span> b <span class="MathJax_Preview">x</span></p>
               <p><span class="math display">\[ z \]</span></p><p><span class="mathematician">no</span></p>"#,
        );
        assert!(!marked.contains("MathJax_Preview"), "{marked}");
        assert!(marked.contains("mathematician"), "other classes untouched");
        // What Readability leaves: text only (entities decoded).
        let blocks = vec![
            Block::Paragraph {
                spans: vec![Span::plain(format!("a {OPEN}ix < y{CLOSE} b"))],
            },
            Block::Paragraph {
                spans: vec![Span::plain(format!("{OPEN}dz{CLOSE}"))],
            },
            Block::Heading {
                level: 2,
                text: format!("On {OPEN}ik{CLOSE}"),
            },
        ];
        let out = restore(blocks);
        let Block::Paragraph { spans } = &out[0] else {
            panic!("{out:?}");
        };
        assert_eq!(spans.len(), 3);
        assert!(spans[1].math && !spans[1].display && spans[1].text == "x < y");
        assert_eq!(spans[2].text, " b");
        assert!(matches!(&out[1], Block::Math { tex } if tex == "z"));
        assert!(matches!(&out[2], Block::Heading { text, .. } if text == "On k"));
    }
}

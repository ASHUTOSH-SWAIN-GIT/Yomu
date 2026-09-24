//! Finding a usable image URL in messy real-world markup: relative and
//! protocol-relative URLs, `srcset`, lazy-load attributes, `<picture>`, and
//! tiny placeholders, plus telling content images from UI chrome.

use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{ElementRef, Html};

use super::blocks::{Block, Span};

/// Attributes lazy-loading libraries use to hold the real image URL while
/// `src` is a placeholder.
const LAZY_SRC_ATTRS: [&str; 5] = [
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-lazy",
    "data-url",
];

/// Placeholders and 1x1 trackers are tiny data URIs; real embedded images
/// are longer than this.
const MIN_DATA_URI_LEN: usize = 300;

/// The best image URL for an `img`: the largest `srcset` candidate, else a
/// lazy-load attribute, else `src`. Result is absolute (resolved against
/// `base`) and http(s) or a real data: URI.
pub(super) fn pick_image_url(el: ElementRef, base: Option<&url::Url>) -> Option<String> {
    let attrs = el.value();
    let mut candidates = ["srcset", "data-srcset"]
        .iter()
        .find_map(|a| attrs.attr(a).and_then(largest_srcset_candidate))
        .into_iter()
        .chain(
            LAZY_SRC_ATTRS
                .iter()
                .filter_map(|a| attrs.attr(a))
                .map(str::to_string),
        )
        .chain(attrs.attr("src").map(str::to_string));

    candidates.find_map(|raw| resolve_image_url(raw.trim(), base))
}

/// Picks the highest resolution entry of a `srcset` ("a.jpg 480w, b.jpg 1080w").
pub(super) fn largest_srcset_candidate(srcset: &str) -> Option<String> {
    srcset
        .split(',')
        .filter_map(|entry| {
            let mut parts = entry.split_whitespace();
            let url = parts.next()?;
            let weight = parts
                .next()
                .and_then(|d| d.trim_end_matches(['w', 'x']).parse::<f32>().ok())
                .unwrap_or(1.0);
            Some((url, weight))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(url, _)| url.to_string())
}

pub(super) fn resolve_image_url(raw: &str, base: Option<&url::Url>) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with("data:") {
        return (raw.len() >= MIN_DATA_URI_LEN).then(|| raw.to_string());
    }
    let resolved = match base {
        Some(base) => base.join(raw).ok()?,
        None => url::Url::parse(raw).ok()?,
    };
    matches!(resolved.scheme(), "http" | "https").then(|| resolved.to_string())
}

/// UI chrome and decoration, not article content: logos, icons, avatars,
/// buttons with click handlers, and anything explicitly hidden from
/// assistive tech. (`role="presentation"` is NOT used: Medium puts it on
/// its content images.) Dimensions come from the `width`/`height` attributes.
pub(super) fn is_decorative_image(el: ElementRef) -> bool {
    let attrs = el.value();
    const MAX_ICON_PX: f32 = 48.0;
    let tiny = ["width", "height"].iter().any(|a| {
        attrs
            .attr(a)
            .and_then(|v| v.trim_end_matches("px").parse::<f32>().ok())
            .is_some_and(|v| v <= MAX_ICON_PX)
    });
    let class = attrs.attr("class").unwrap_or("").to_lowercase();
    let noisy_class = [
        "icon", "logo", "emoji", "avatar", "badge", "sprite", "spinner",
    ]
    .iter()
    .any(|word| class.contains(word));
    tiny || noisy_class
        || attrs.attr("onclick").is_some()
        || attrs.attr("aria-hidden") == Some("true")
}

/// Best URL of a `<picture>`: its sources' `srcset`s first (the fallback
/// `img` is frequently empty, e.g. on Medium), then the `img` itself.
pub(super) fn pick_picture_url(picture: ElementRef, base: Option<&url::Url>) -> Option<String> {
    let from_sources = picture
        .descendants()
        .filter_map(ElementRef::wrap)
        .filter(|e| e.value().name() == "source")
        .filter_map(|e| e.value().attr("srcset").and_then(largest_srcset_candidate))
        .find_map(|raw| resolve_image_url(raw.trim(), base));
    from_sources.or_else(|| {
        picture
            .descendants()
            .filter_map(ElementRef::wrap)
            .find(|e| e.value().name() == "img")
            .and_then(|img| pick_image_url(img, base))
    })
}

static PICTURE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?is)<picture\b[^>]*>(.*?)</picture>").expect("valid regex"));
static SRCSET_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')"#).expect("valid regex")
});
static ALT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?is)\balt\s*=\s*(?:"([^"]*)"|'([^']*)')"#).expect("valid regex"));
static IMG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<img\b[^>]*>").expect("valid regex"));

fn attr_value<'a>(re: &Regex, text: &'a str) -> Option<&'a str> {
    let caps = re.captures(text)?;
    caps.get(1).or_else(|| caps.get(2)).map(|m| m.as_str())
}

/// A content image found before Readability ran.
#[derive(Debug, Clone, PartialEq)]
pub struct ImageRef {
    pub src: String,
    pub alt: Option<String>,
}

// The `readability` crate throws away any `<div>` holding more images than
// paragraphs (its gallery heuristic), so image-only wrappers, which is how
// Medium and many blogs lay out figures, vanish along with the image. It
// also drops `<picture>` and `<img>` without `src`. So content images are
// swapped for a *text* placeholder before it runs and restored afterwards.
// The placeholder is long (>25 chars) because the crate also drops
// containers with very little text.
const TOKEN_PREFIX: &str = "YOMUIMGTOKEN_";
const TOKEN_SUFFIX: &str = "_PLACEHOLDERPADDING_X";

static TOKEN_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(&format!(r"{TOKEN_PREFIX}(\d+){TOKEN_SUFFIX}")).expect("valid regex"));

fn token(index: usize) -> String {
    format!("<p>{TOKEN_PREFIX}{index}{TOKEN_SUFFIX}</p>")
}

fn parse_img(tag: &str) -> Html {
    Html::parse_fragment(tag)
}

fn first_img(fragment: &Html) -> Option<ElementRef<'_>> {
    fragment
        .root_element()
        .descendants()
        .filter_map(ElementRef::wrap)
        .find(|e| e.value().name() == "img")
}

fn clean_alt(alt: Option<&str>) -> Option<String> {
    alt.map(str::trim)
        .filter(|a| !a.is_empty())
        .map(str::to_string)
}

/// Replaces every content image in `html` (`<picture>` and `<img>`) with a
/// text placeholder, returning the new HTML and the images in placeholder
/// order. Decorative images (icons, logos, tracking pixels) and images with
/// no usable URL are removed outright. Relative URLs resolve against `base`.
pub fn tokenize_images(html: &str, base: &url::Url) -> (String, Vec<ImageRef>) {
    let mut images: Vec<ImageRef> = Vec::new();

    let with_pictures = PICTURE_RE.replace_all(html, |caps: &regex::Captures| {
        let inner = &caps[1];
        let fragment = parse_img(inner);
        let img = first_img(&fragment);
        if img.is_some_and(is_decorative_image) {
            return String::new();
        }
        let from_sources = SRCSET_RE
            .captures_iter(inner)
            .filter_map(|c| c.get(1).or_else(|| c.get(2)))
            .filter_map(|m| largest_srcset_candidate(m.as_str()))
            .find_map(|raw| resolve_image_url(raw.trim(), Some(base)));
        let src = from_sources.or_else(|| img.and_then(|i| pick_image_url(i, Some(base))));
        match src {
            Some(src) => {
                let alt = clean_alt(attr_value(&ALT_RE, inner));
                images.push(ImageRef { src, alt });
                token(images.len() - 1)
            }
            None => String::new(),
        }
    });

    let out = IMG_RE.replace_all(&with_pictures, |caps: &regex::Captures| {
        let fragment = parse_img(&caps[0]);
        let Some(img) = first_img(&fragment) else {
            return String::new();
        };
        if is_decorative_image(img) {
            return String::new();
        }
        match pick_image_url(img, Some(base)) {
            Some(src) => {
                images.push(ImageRef {
                    src,
                    alt: clean_alt(img.value().attr("alt")),
                });
                token(images.len() - 1)
            }
            None => String::new(),
        }
    });

    (out.into_owned(), images)
}

/// Removes placeholders from `text`, returning the indexes found.
fn strip_tokens(text: &str) -> (String, Vec<usize>) {
    let found = TOKEN_RE
        .captures_iter(text)
        .filter_map(|c| c[1].parse().ok())
        .collect();
    (TOKEN_RE.replace_all(text, "").into_owned(), found)
}

fn strip_from_spans(spans: &mut Vec<Span>, found: &mut Vec<usize>) {
    for span in spans.iter_mut() {
        let (clean, tokens) = strip_tokens(&span.text);
        span.text = clean;
        found.extend(tokens);
    }
    spans.retain(|s| !s.text.is_empty());
}

/// Turns placeholders in the extracted blocks back into `Image` blocks. A
/// paragraph that was only a placeholder becomes just the image; placeholders
/// inside other text are removed from it and the image follows that block.
pub fn restore_image_tokens(blocks: Vec<Block>, images: &[ImageRef]) -> Vec<Block> {
    let mut out = Vec::with_capacity(blocks.len());
    for mut block in blocks {
        let mut found = Vec::new();
        match &mut block {
            Block::Paragraph { spans } | Block::Quote { spans } => {
                strip_from_spans(spans, &mut found)
            }
            Block::List { items, .. } => {
                for item in items.iter_mut() {
                    strip_from_spans(&mut item.spans, &mut found);
                }
                items.retain(|i| !i.spans.is_empty());
            }
            Block::Heading { text, .. } => {
                let (clean, tokens) = strip_tokens(text);
                *text = clean.trim().to_string();
                found.extend(tokens);
            }
            _ => {}
        }
        let emptied = matches!(&block, Block::Paragraph { spans } | Block::Quote { spans } if spans.iter().all(|s| s.text.trim().is_empty()))
            || matches!(&block, Block::List { items, .. } if items.is_empty())
            || matches!(&block, Block::Heading { text, .. } if text.is_empty());
        if !emptied {
            out.push(block);
        }
        for index in found {
            if let Some(image) = images.get(index) {
                out.push(Block::Image {
                    src: image.src.clone(),
                    alt: image.alt.clone(),
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> url::Url {
        url::Url::parse("https://medium.com/@a/post").unwrap()
    }

    fn srcs(images: &[ImageRef]) -> Vec<&str> {
        images.iter().map(|i| i.src.as_str()).collect()
    }

    #[test]
    fn picture_becomes_one_placeholder_with_the_largest_source() {
        let html = r#"<figure><picture><source srcSet="https://cdn.x/a-640.webp 640w, https://cdn.x/a-1400.webp 1400w" sizes="100vw"/><img alt="A diagram" class="c" width="700" height="317" role="presentation"/></picture></figure>"#;
        let (out, images) = tokenize_images(html, &base());
        assert_eq!(srcs(&images), vec!["https://cdn.x/a-1400.webp"]);
        assert_eq!(images[0].alt.as_deref(), Some("A diagram"));
        assert!(out.contains("YOMUIMGTOKEN_0_"), "{out}");
        assert!(!out.contains("<picture") && !out.contains("<img"));
    }

    #[test]
    fn plain_and_lazy_images_are_tokenized_in_document_order() {
        let html =
            r#"<img src="/a.png" alt="first"><p>text</p><img class="lazy" data-src="/b.jpg">"#;
        let (out, images) = tokenize_images(html, &base());
        assert_eq!(
            srcs(&images),
            vec!["https://medium.com/a.png", "https://medium.com/b.jpg"]
        );
        assert!(out.find("TOKEN_0_").unwrap() < out.find("TOKEN_1_").unwrap());
    }

    #[test]
    fn decorative_and_unusable_images_are_removed_without_a_token() {
        let html = r#"<img src="/i.svg" class="icon"><img alt="nothing"><picture><img alt="x"></picture><img src="/k.png" width="16" height="16">"#;
        let (out, images) = tokenize_images(html, &base());
        assert!(images.is_empty());
        assert!(!out.contains("<img") && !out.contains("TOKEN"), "{out}");
    }

    #[test]
    fn placeholder_text_is_long_enough_to_survive_readability_cleaning() {
        // readability drops containers with < 25 chars of text.
        let html = r#"<div><img src="/a.png"></div>"#;
        let (out, _) = tokenize_images(html, &base());
        let text: String = Html::parse_fragment(&out).root_element().text().collect();
        assert!(text.len() > 25, "{text}");
    }

    fn para(text: &str) -> Block {
        Block::Paragraph {
            spans: vec![Span::plain(text.to_string())],
        }
    }

    fn tok(i: usize) -> String {
        format!("{TOKEN_PREFIX}{i}{TOKEN_SUFFIX}")
    }

    fn imgs() -> Vec<ImageRef> {
        vec![
            ImageRef {
                src: "https://x/0.png".into(),
                alt: Some("zero".into()),
            },
            ImageRef {
                src: "https://x/1.png".into(),
                alt: None,
            },
        ]
    }

    #[test]
    fn a_placeholder_only_paragraph_becomes_just_the_image() {
        let blocks =
            restore_image_tokens(vec![para("before"), para(&tok(0)), para("after")], &imgs());
        assert_eq!(blocks.len(), 3);
        assert_eq!(
            blocks[1],
            Block::Image {
                src: "https://x/0.png".into(),
                alt: Some("zero".into())
            }
        );
    }

    #[test]
    fn placeholders_inside_text_are_stripped_and_the_image_follows() {
        let text = format!("look {} at this", tok(1));
        let blocks = restore_image_tokens(vec![para(&text)], &imgs());
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0], para("look  at this"));
        assert!(matches!(&blocks[1], Block::Image { src, .. } if src == "https://x/1.png"));
    }

    #[test]
    fn placeholders_in_list_items_and_headings_do_not_leak_into_text() {
        let list = Block::List {
            ordered: false,
            items: vec![super::super::blocks::ListItem {
                spans: vec![Span::plain(format!("item {}", tok(0)))],
                depth: 0,
            }],
        };
        let heading = Block::Heading {
            level: 2,
            text: format!("Title {}", tok(1)),
        };
        let blocks = restore_image_tokens(vec![list, heading], &imgs());
        let json = format!("{blocks:?}");
        assert!(!json.contains("YOMUIMGTOKEN"), "{json}");
        assert_eq!(
            blocks
                .iter()
                .filter(|b| matches!(b, Block::Image { .. }))
                .count(),
            2
        );
    }

    #[test]
    fn unknown_placeholder_numbers_are_ignored_not_fatal() {
        let blocks = restore_image_tokens(vec![para(&tok(9))], &imgs());
        assert!(blocks.is_empty());
    }
}

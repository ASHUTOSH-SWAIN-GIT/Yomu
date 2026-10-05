//! Some sites publish a raw Markdown copy of an article that leaves out what
//! their page builder renders itself: charts, screenshots and other images
//! added by components. Reading the Markdown is still the most faithful way
//! to get the text, so the images the rendered page has and the Markdown
//! lacks are added back, each after the paragraph it follows on the page.

use std::collections::HashSet;

use url::Url;

use super::blocks::{Block, Span};

/// Whether a path segment is a UUID (`8-4-4-4-12` hex digits), the id image
/// hosts such as Cloudflare Images put in the address of every picture.
fn is_uuid(segment: &str) -> bool {
    let parts: Vec<&str> = segment.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// An image's identity across URL variants. One picture is often linked
/// several ways: resize parameters, a query string, or a size name in the
/// last segment (`.../<id>/public`, `.../<id>/orig`). The id in the address
/// when there is one, else the file name without extension.
fn image_key(src: &str) -> String {
    let path = Url::parse(src)
        .map(|u| u.path().to_string())
        .unwrap_or_else(|_| src.split(['?', '#']).next().unwrap_or(src).to_string());
    if let Some(id) = path.split('/').find(|segment| is_uuid(segment)) {
        return id.to_lowercase();
    }
    let name = path.rsplit('/').next().unwrap_or(&path);
    name.rsplit_once('.')
        .map_or(name, |(stem, _)| stem)
        .to_lowercase()
}

fn spans_text(spans: &[Span]) -> String {
    spans.iter().map(|s| s.text.as_str()).collect()
}

/// A block's text, lowercased to letters and digits and cut short, for
/// telling the same paragraph apart in two renderings of an article. `None`
/// for blocks with no usable text.
fn text_key(block: &Block) -> Option<String> {
    let text = match block {
        Block::Heading { text, .. } => text.clone(),
        Block::Paragraph { spans } | Block::Quote { spans } => spans_text(spans),
        Block::List { items, .. } => items.first().map(|i| spans_text(&i.spans))?,
        _ => return None,
    };
    let key: String = text
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .take(60)
        .collect();
    (key.chars().count() >= 15).then_some(key)
}

/// Adds the images in `rendered` that `base` is missing. An image goes after
/// the nearest block before it that also appears in `base`, or else before
/// the nearest one after it; an image with no such neighbour is left out
/// rather than guessed at.
pub fn add_missing_images(base: &mut Vec<Block>, rendered: &[Block]) {
    let mut have: HashSet<String> = base
        .iter()
        .filter_map(|b| match b {
            Block::Image { src, .. } => Some(image_key(src)),
            _ => None,
        })
        .collect();
    let base_keys: Vec<Option<String>> = base.iter().map(text_key).collect();
    let position = |key: &Option<String>| -> Option<usize> {
        let key = key.as_ref()?;
        base_keys.iter().position(|k| k.as_ref() == Some(key))
    };

    // (index in `base` to insert after, or None for the very start; image)
    let mut inserts: Vec<(Option<usize>, Block)> = Vec::new();
    for (i, block) in rendered.iter().enumerate() {
        let Block::Image { src, .. } = block else {
            continue;
        };
        if !have.insert(image_key(src)) {
            continue;
        }
        let before = rendered[..i]
            .iter()
            .rev()
            .find_map(|b| position(&text_key(b)));
        let slot = match before {
            Some(p) => Some(Some(p)),
            None => rendered[i + 1..]
                .iter()
                .find_map(|b| position(&text_key(b)))
                .map(|p| p.checked_sub(1)),
        };
        if let Some(slot) = slot {
            inserts.push((slot, block.clone()));
        }
    }

    // Stable sort keeps the rendered page's order for images sharing a slot;
    // inserting from the back keeps earlier indexes valid.
    inserts.sort_by_key(|(slot, _)| slot.map_or(0, |p| p + 1));
    for (slot, block) in inserts.into_iter().rev() {
        base.insert(slot.map_or(0, |p| p + 1), block);
    }
}

/// Makes image addresses absolute against the page, since a Markdown file
/// often writes them as `/images/x.png`.
pub fn absolutize_images(blocks: &mut [Block], page: &Url) {
    for block in blocks {
        if let Block::Image { src, .. } = block {
            if let Ok(full) = page.join(src) {
                *src = full.to_string();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn para(text: &str) -> Block {
        Block::Paragraph {
            spans: vec![Span::plain(text.into())],
        }
    }
    fn img(src: &str) -> Block {
        Block::Image {
            src: src.into(),
            alt: None,
        }
    }
    const A: &str = "The first paragraph of the article.";
    const B: &str = "The second paragraph, a little later.";
    const C: &str = "And the third paragraph at the end.";

    #[test]
    fn adds_an_image_the_markdown_lacks_after_its_paragraph() {
        let mut base = vec![para(A), para(B), para(C)];
        let rendered = vec![para(A), para(B), img("https://cdn.x/chart_1.png"), para(C)];
        add_missing_images(&mut base, &rendered);
        assert_eq!(
            base,
            vec![para(A), para(B), img("https://cdn.x/chart_1.png"), para(C)]
        );
    }

    #[test]
    fn keeps_the_order_of_several_images_in_one_place() {
        let mut base = vec![para(A), para(B)];
        let rendered = vec![
            para(A),
            img("https://cdn.x/one.png"),
            img("https://cdn.x/two.png"),
            para(B),
        ];
        add_missing_images(&mut base, &rendered);
        assert_eq!(
            base,
            vec![
                para(A),
                img("https://cdn.x/one.png"),
                img("https://cdn.x/two.png"),
                para(B)
            ]
        );
    }

    #[test]
    fn does_not_duplicate_an_image_it_already_has_under_another_url() {
        let mut base = vec![
            para(A),
            img("https://cdn.x/upload/w_50/chart_1.png"),
            para(B),
        ];
        let rendered = vec![
            para(A),
            img("https://cdn.x/upload/w_1800/chart_1.jpg?v=2"),
            para(B),
        ];
        add_missing_images(&mut base, &rendered);
        assert_eq!(base.len(), 3);
    }

    #[test]
    fn treats_size_variants_of_one_hosted_image_as_the_same_image() {
        let id = "73c08a93-2662-4fa0-f28d-63925bac3c00";
        let mut base = vec![
            img(&format!("https://imagedelivery.net/acct/{id}/public")),
            para(A),
        ];
        let rendered = vec![
            img(&format!("https://imagedelivery.net/acct/{id}/md2x")),
            img(&format!("https://imagedelivery.net/acct/{id}/orig")),
            para(A),
        ];
        add_missing_images(&mut base, &rendered);
        assert_eq!(base.len(), 2);
    }

    #[test]
    fn different_images_with_the_same_size_name_stay_separate() {
        let mut base = vec![
            img("https://h.dev/acct/73c08a93-2662-4fa0-f28d-63925bac3c00/public"),
            para(A),
        ];
        let rendered = vec![
            img("https://h.dev/acct/11111111-2222-3333-4444-555555555555/public"),
            para(A),
        ];
        add_missing_images(&mut base, &rendered);
        assert_eq!(base.len(), 3);
    }

    #[test]
    fn an_image_before_the_first_known_paragraph_goes_to_the_start() {
        let mut base = vec![para(A)];
        let rendered = vec![img("https://cdn.x/hero.png"), para(A)];
        add_missing_images(&mut base, &rendered);
        assert_eq!(base, vec![img("https://cdn.x/hero.png"), para(A)]);
    }

    #[test]
    fn leaves_out_an_image_with_no_matching_neighbour() {
        let mut base = vec![para(A)];
        let rendered = vec![
            para("Completely different text here."),
            img("https://cdn.x/z.png"),
        ];
        add_missing_images(&mut base, &rendered);
        assert_eq!(base, vec![para(A)]);
    }

    #[test]
    fn makes_relative_image_addresses_absolute() {
        let mut blocks = vec![img("/images/a.png"), img("https://other.dev/b.png")];
        absolutize_images(
            &mut blocks,
            &Url::parse("https://site.dev/blog/post").unwrap(),
        );
        assert_eq!(
            blocks,
            vec![
                img("https://site.dev/images/a.png"),
                img("https://other.dev/b.png")
            ]
        );
    }
}

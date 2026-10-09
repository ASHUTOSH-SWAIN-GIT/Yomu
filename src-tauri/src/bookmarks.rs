//! Pages the user bookmarks into a folder named "Yomu" in their browser, so
//! Yomu can save them. Chrome, Brave and Helium (and other Chromium browsers)
//! keep bookmarks in a plain `Bookmarks` file in each profile folder; reading
//! it needs no extension and works whether or not Yomu was running when the
//! page was bookmarked. Browser sync fills the same file, so a page bookmarked
//! on a phone arrives too.
//!
//! Only links inside a folder with the wanted name are used; the rest of the
//! file is never kept or looked at beyond finding that folder.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

/// A page found in the bookmarks folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkLink {
    pub url: String,
    pub title: String,
    pub browser: String,
    /// When it was bookmarked (unix milliseconds), if the browser says.
    pub added: Option<i64>,
}

/// What was found for one browser, for the settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub name: String,
    /// The browser has a bookmarks file on this computer.
    pub found: bool,
    /// One of them has the wanted folder.
    pub has_folder: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub links: Vec<BookmarkLink>,
    pub browsers: Vec<BrowserStatus>,
}

/// The data folder of each supported browser on this system. Helium is only
/// known on macOS.
fn browser_dirs() -> Vec<(String, PathBuf)> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut out: Vec<(&str, Option<PathBuf>)> = Vec::new();
    if cfg!(target_os = "macos") {
        let support = home.map(|h| h.join("Library/Application Support"));
        let at = |rel: &str| support.as_ref().map(|s| s.join(rel));
        out.push(("Chrome", at("Google/Chrome")));
        out.push(("Brave", at("BraveSoftware/Brave-Browser")));
        out.push(("Helium", at("net.imput.helium")));
    } else if cfg!(target_os = "windows") {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let at = |rel: &str| local.as_ref().map(|l| l.join(rel));
        out.push(("Chrome", at("Google/Chrome/User Data")));
        out.push(("Brave", at("BraveSoftware/Brave-Browser/User Data")));
    } else {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| home.map(|h| h.join(".config")));
        let at = |rel: &str| config.as_ref().map(|c| c.join(rel));
        out.push(("Chrome", at("google-chrome")));
        out.push(("Brave", at("BraveSoftware/Brave-Browser")));
    }
    out.into_iter()
        .filter_map(|(name, dir)| dir.map(|d| (name.to_string(), d)))
        .collect()
}

/// Chrome stores dates as microseconds since 1601-01-01.
fn unix_ms_from_chrome(date: &str) -> Option<i64> {
    let micros: i64 = date.parse().ok()?;
    let ms = micros / 1000 - 11_644_473_600_000;
    (ms > 0).then_some(ms)
}

/// A page as the file lists it: address, title, when it was added.
type RawLink = (String, String, Option<i64>);

/// Every page inside a folder called `folder` (any depth, any case, and
/// folders within it), in the order the browser lists them. The second value
/// says whether such a folder exists at all.
fn links_in(json: &str, folder: &str) -> Option<(Vec<RawLink>, bool)> {
    let root: Value = serde_json::from_str(json).ok()?;
    let wanted = folder.trim().to_lowercase();
    let mut links = Vec::new();
    let mut found = false;

    fn walk(node: &Value, wanted: &str, inside: bool, found: &mut bool, links: &mut Vec<RawLink>) {
        match node.get("type").and_then(Value::as_str) {
            Some("folder") => {
                let is_it = node
                    .get("name")
                    .and_then(Value::as_str)
                    .is_some_and(|n| n.trim().to_lowercase() == wanted);
                *found |= is_it;
                for child in node
                    .get("children")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    walk(child, wanted, inside || is_it, found, links);
                }
            }
            Some("url") if inside => {
                let Some(url) = node.get("url").and_then(Value::as_str) else {
                    return;
                };
                // Pages only: not `javascript:` bookmarklets or `chrome://`.
                if !(url.starts_with("http://") || url.starts_with("https://")) {
                    return;
                }
                links.push((
                    url.to_string(),
                    node.get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    node.get("date_added")
                        .and_then(Value::as_str)
                        .and_then(unix_ms_from_chrome),
                ));
            }
            _ => {}
        }
    }

    for node in root.get("roots")?.as_object()?.values() {
        if node.is_object() {
            walk(node, &wanted, false, &mut found, &mut links);
        }
    }
    Some((links, found))
}

/// The folders in `dir` that hold a bookmarks file (one per browser profile).
fn bookmark_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path().join("Bookmarks"))
        .filter(|f| f.is_file())
        .collect();
    files.sort();
    files
}

/// Reads the given browsers' bookmark files. A page bookmarked in several
/// places is listed once.
pub fn scan_in(browsers: &[(String, PathBuf)], folder: &str) -> Scan {
    let mut links = Vec::new();
    let mut seen = HashSet::new();
    let mut statuses = Vec::new();
    for (name, dir) in browsers {
        let files = bookmark_files(dir);
        let mut has_folder = false;
        for file in &files {
            // A bookmarks file is a few hundred KB; far more is not one.
            if std::fs::metadata(file).map_or(true, |m| m.len() > 50_000_000) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(file) else {
                continue;
            };
            let Some((found_links, found)) = links_in(&text, folder) else {
                continue;
            };
            has_folder |= found;
            for (url, title, added) in found_links {
                if seen.insert(url.clone()) {
                    links.push(BookmarkLink {
                        url,
                        title,
                        browser: name.clone(),
                        added,
                    });
                }
            }
        }
        statuses.push(BrowserStatus {
            name: name.clone(),
            found: !files.is_empty(),
            has_folder,
        });
    }
    Scan {
        links,
        browsers: statuses,
    }
}

/// Reads this computer's browsers.
pub fn scan(folder: &str) -> Scan {
    scan_in(&browser_dirs(), folder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn url(name: &str, url: &str, added: &str) -> Value {
        json!({ "type": "url", "name": name, "url": url, "date_added": added })
    }

    fn folder(name: &str, children: Vec<Value>) -> Value {
        json!({ "type": "folder", "name": name, "children": children })
    }

    fn file(bar: Vec<Value>, other: Vec<Value>) -> String {
        json!({
            "version": 1,
            "roots": {
                "bookmark_bar": folder("Bookmarks bar", bar),
                "other": folder("Other bookmarks", other),
                "synced": folder("Mobile Bookmarks", vec![]),
                "sync_transaction_version": "3",
            }
        })
        .to_string()
    }

    #[test]
    fn finds_the_pages_in_the_folder_and_nothing_else() {
        let json = file(
            vec![
                url("Elsewhere", "https://elsewhere.dev/a", "0"),
                folder(
                    "Yomu",
                    vec![
                        url("One", "https://example.dev/one", "13417274055589650"),
                        url("Two", "http://example.dev/two", "0"),
                    ],
                ),
            ],
            vec![],
        );
        let (links, found) = links_in(&json, "Yomu").unwrap();
        assert!(found);
        let urls: Vec<&str> = links.iter().map(|l| l.0.as_str()).collect();
        assert_eq!(urls, ["https://example.dev/one", "http://example.dev/two"]);
        assert_eq!(links[0].1, "One");
    }

    #[test]
    fn the_folder_may_be_anywhere_in_any_case_with_folders_inside() {
        let json = file(
            vec![],
            vec![folder(
                "Reading",
                vec![folder(
                    " yomu ",
                    vec![
                        url("A", "https://a.dev/1", "0"),
                        folder("Later", vec![url("B", "https://b.dev/2", "0")]),
                    ],
                )],
            )],
        );
        let (links, found) = links_in(&json, "Yomu").unwrap();
        assert!(found);
        assert_eq!(links.len(), 2);
    }

    #[test]
    fn only_web_pages_count() {
        let json = file(
            vec![folder(
                "Yomu",
                vec![
                    url("Code", "javascript:alert(1)", "0"),
                    url("Settings", "chrome://settings", "0"),
                    url("File", "file:///etc/passwd", "0"),
                    url("Real", "https://real.dev/x", "0"),
                ],
            )],
            vec![],
        );
        let (links, _) = links_in(&json, "Yomu").unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].0, "https://real.dev/x");
    }

    #[test]
    fn says_so_when_there_is_no_such_folder() {
        let json = file(vec![url("A", "https://a.dev", "0")], vec![]);
        let (links, found) = links_in(&json, "Yomu").unwrap();
        assert!(links.is_empty() && !found);
    }

    #[test]
    fn a_file_that_is_not_bookmarks_is_ignored() {
        assert!(links_in("not json", "Yomu").is_none());
        assert!(links_in("{}", "Yomu").is_none());
    }

    #[test]
    fn dates_become_unix_milliseconds() {
        // Chrome counts microseconds from 1601; this is 2026-03-06.
        assert_eq!(
            unix_ms_from_chrome("13417274055589650"),
            Some(1_772_800_455_589)
        );
        assert_eq!(unix_ms_from_chrome("0"), None);
        assert_eq!(unix_ms_from_chrome("x"), None);
    }

    #[test]
    fn reads_every_profile_of_every_browser_and_lists_a_page_once() {
        let root = std::env::temp_dir().join(format!("yomu-bookmarks-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let write = |browser: &str, profile: &str, text: String| {
            let dir = root.join(browser).join(profile);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("Bookmarks"), text).unwrap();
        };
        let yomu = |links: Vec<Value>| file(vec![folder("Yomu", links)], vec![]);
        write(
            "brave",
            "Default",
            yomu(vec![url("A", "https://a.dev/1", "0")]),
        );
        write(
            "brave",
            "Profile 1",
            yomu(vec![
                url("A again", "https://a.dev/1", "0"),
                url("B", "https://b.dev/2", "0"),
            ]),
        );
        write("helium", "Default", file(vec![], vec![]));
        std::fs::create_dir_all(root.join("chrome/Default")).unwrap();

        let scan = scan_in(
            &[
                ("Brave".into(), root.join("brave")),
                ("Helium".into(), root.join("helium")),
                ("Chrome".into(), root.join("chrome")),
                ("Missing".into(), root.join("nowhere")),
            ],
            "Yomu",
        );
        let urls: Vec<&str> = scan.links.iter().map(|l| l.url.as_str()).collect();
        assert_eq!(urls, ["https://a.dev/1", "https://b.dev/2"]);
        assert_eq!(scan.links[0].browser, "Brave");
        let status: Vec<(&str, bool, bool)> = scan
            .browsers
            .iter()
            .map(|b| (b.name.as_str(), b.found, b.has_folder))
            .collect();
        assert_eq!(
            status,
            [
                ("Brave", true, true),
                ("Helium", true, false),
                ("Chrome", false, false),
                ("Missing", false, false),
            ]
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// Opt-in: reads the real browsers on this computer and says what it
    /// found (never the pages themselves).
    /// `cargo test real_browsers -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_browsers() {
        let scan = scan("Yomu");
        for b in &scan.browsers {
            println!("{}: found={} yomu_folder={}", b.name, b.found, b.has_folder);
        }
        println!("{} pages in Yomu folders", scan.links.len());
    }
}

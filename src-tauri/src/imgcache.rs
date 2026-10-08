//! Offline image cache. When an article is saved its images are downloaded
//! into `<app data>/images/`, so it reads fully offline, and re-opening it
//! never contacts the image hosts again (no trackers, no broken links later).
//!
//! Files are named by a hash of their URL, so the same image is stored once
//! and the name is stable across app versions. Downloads are deliberately
//! constrained: images only, capped size and count, a few at a time.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_URLS_PER_CALL: usize = 80;
const CONCURRENT_DOWNLOADS: usize = 4;
/// The whole cache stays under this; the least recently used images go first.
const MAX_CACHE_BYTES: u64 = 500 * 1024 * 1024;

pub fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("images"))
        .map_err(|e| format!("could not find the app data directory: {e}"))
}

/// Stable, filesystem-safe name for a URL (first 32 hex chars of SHA-256).
fn file_stem(url: &str) -> String {
    let digest = Sha256::digest(url.as_bytes());
    digest.iter().take(16).map(|b| format!("{b:02x}")).collect()
}

fn ext_for_mime(content_type: &str) -> Option<&'static str> {
    let mime = content_type.split(';').next()?.trim().to_lowercase();
    match mime.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/avif" => Some("avif"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

/// For servers that label images `application/octet-stream`: identify by
/// magic bytes. Only formats we can display are recognised.
fn sniff_ext(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => Some("png"),
        [0xff, 0xd8, 0xff, ..] => Some("jpg"),
        [b'G', b'I', b'F', b'8', ..] => Some("gif"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("webp"),
        _ => {
            let head = String::from_utf8_lossy(&bytes[..bytes.len().min(256)]).to_lowercase();
            let head = head.trim_start();
            (head.starts_with("<svg") || (head.starts_with("<?xml") && head.contains("<svg")))
                .then_some("svg")
        }
    }
}

/// The cached file for `stem`, if one exists (any extension).
fn find_existing(dir: &Path, stem: &str) -> Option<String> {
    std::fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        (name.starts_with(&format!("{stem}.")) && !name.ends_with(".part")).then_some(name)
    })
}

/// Downloads one image into `dir`, returning its file name. `None` for
/// anything that isn't a reasonable image: bad status, not an image, too big.
async fn download(client: &reqwest::Client, url: &str, dir: &Path) -> Option<String> {
    let stem = file_stem(url);
    if let Some(existing) = find_existing(dir, &stem) {
        // Reuse counts as use, so what you still read is evicted last.
        if let Ok(file) = std::fs::File::options()
            .write(true)
            .open(dir.join(&existing))
        {
            let _ = file.set_modified(std::time::SystemTime::now());
        }
        return Some(existing);
    }

    let mut response = client
        .get(url)
        .header("Accept", "image/*")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    if response
        .content_length()
        .is_some_and(|len| len as usize > MAX_IMAGE_BYTES)
    {
        return None;
    }
    let mime_ext = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(ext_for_mime);

    // Stream with a hard cap: Content-Length can be absent or wrong.
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_IMAGE_BYTES {
            return None;
        }
    }
    if body.is_empty() {
        return None;
    }
    // The bytes must agree it's an image, whatever the header claimed.
    let ext = sniff_ext(&body).or(mime_ext.filter(|_| looks_like_image(&body)))?;

    let name = format!("{stem}.{ext}");
    let part = dir.join(format!("{name}.part"));
    // Write-then-rename so a crash never leaves a half file that looks valid.
    tokio::fs::write(&part, &body).await.ok()?;
    tokio::fs::rename(&part, dir.join(&name)).await.ok()?;
    Some(name)
}

/// Formats we accept by header alone (avif/bmp have no sniffer above) still
/// must not be HTML error pages.
fn looks_like_image(body: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&body[..body.len().min(64)]).to_lowercase();
    !head.trim_start().starts_with("<!doctype") && !head.trim_start().starts_with("<html")
}

/// Downloads `urls`, returning the file name for each (aligned with the
/// input, `None` where it failed or was skipped).
pub async fn cache_images(
    client: &reqwest::Client,
    dir: &Path,
    urls: &[String],
) -> Result<Vec<Option<String>>, String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("could not create the image cache: {e}"))?;

    let gate = Arc::new(Semaphore::new(CONCURRENT_DOWNLOADS));
    let mut tasks = JoinSet::new();
    for (index, url) in urls.iter().take(MAX_URLS_PER_CALL).enumerate() {
        // Only ever fetch web URLs (never file:, data:, etc.).
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            continue;
        }
        let (client, gate, url, dir) =
            (client.clone(), gate.clone(), url.clone(), dir.to_path_buf());
        tasks.spawn(async move {
            let _permit = gate.acquire().await.ok()?;
            Some((index, download(&client, &url, &dir).await?))
        });
    }

    let mut files = vec![None; urls.len()];
    while let Some(done) = tasks.join_next().await {
        if let Ok(Some((index, name))) = done {
            files[index] = Some(name);
        }
    }
    evict_over(dir, MAX_CACHE_BYTES);
    Ok(files)
}

/// Deletes the least recently used files until the cache fits in `max_bytes`.
/// An evicted image is simply downloaded again when its article is opened.
fn evict_over(dir: &Path, max_bytes: u64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<_> = entries
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok().filter(|m| m.is_file())?;
            Some((m.modified().ok()?, m.len(), e.path()))
        })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.0);
    for (_, len, path) in files {
        if total <= max_bytes {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            total -= len;
        }
    }
}

/// File names currently in the cache.
pub fn list_names(dir: &Path) -> Vec<String> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Largest image sent to the agent as it is. Bigger images cost a lot of plan
/// quota and are usually slow to process, so they are shrunk first.
const MAX_AGENT_IMAGE_BYTES: usize = 5 * 1024 * 1024;
/// Longest side of a shrunk image: still sharp for a diagram, far smaller.
const SHRUNK_SIDE: u32 = 2048;

/// Scales an image down and re-encodes it as JPEG. `None` if it cannot be
/// decoded or is still over `limit` afterwards.
fn shrink(bytes: &[u8], limit: usize) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    let img = img.thumbnail(SHRUNK_SIDE, SHRUNK_SIDE);
    // JPEG has no transparency; flatten to RGB first.
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85)
        .encode_image(&image::DynamicImage::ImageRgb8(img.to_rgb8()))
        .ok()?;
    (out.len() <= limit).then_some(out)
}

/// An image ready to attach to a prompt.
#[derive(Debug, PartialEq)]
pub struct AgentImage {
    pub mime: &'static str,
    pub base64: String,
}

fn agent_mime(file_name: &str) -> Result<&'static str, String> {
    match file_name.rsplit('.').next().unwrap_or("") {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "gif" => Ok("image/gif"),
        "webp" => Ok("image/webp"),
        "svg" => Err(
            "SVG diagrams can't be sent to the agent as images. Select the text around it instead."
                .into(),
        ),
        other => Err(format!("the agent can't read .{other} images")),
    }
}

/// Loads the image at `url` for a prompt: from the cache if it's there,
/// otherwise downloading it now (the user asked for it explicitly, so this
/// happens even when background caching is off).
pub async fn load_for_agent(
    client: &reqwest::Client,
    dir: &Path,
    url: &str,
) -> Result<AgentImage, String> {
    use base64::Engine;

    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only web images can be sent to the agent".into());
    }
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("could not create the image cache: {e}"))?;
    let name = download(client, url, dir)
        .await
        .ok_or_else(|| "could not download that image".to_string())?;
    let mime = agent_mime(&name)?;

    let mut bytes = tokio::fs::read(dir.join(&name))
        .await
        .map_err(|e| format!("could not read the cached image: {e}"))?;
    let mut mime = mime;
    if bytes.len() > MAX_AGENT_IMAGE_BYTES {
        // Decoding a big image is slow; keep it off the async threads.
        let original = bytes.len();
        bytes = tokio::task::spawn_blocking(move || shrink(&bytes, MAX_AGENT_IMAGE_BYTES))
            .await
            .ok()
            .flatten()
            .ok_or_else(|| {
                format!(
                    "that image is {:.1} MB and could not be shrunk below 5 MB",
                    original as f64 / 1_048_576.0
                )
            })?;
        mime = "image/jpeg";
    }
    Ok(AgentImage {
        mime,
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

/// Deletes cached files not in `keep` (after articles are removed). Returns
/// how many were deleted. Only touches files inside the cache directory.
pub fn prune(dir: &Path, keep: &[String]) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            entry.path().is_file() && !keep.contains(&name)
        })
        .filter(|entry| std::fs::remove_file(entry.path()).is_ok())
        .count()
}

/// Total size in bytes and number of files directly inside `dir`.
pub fn dir_stats(dir: &Path) -> (u64, usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok().filter(|m| m.is_file()))
        .fold((0, 0), |(bytes, count), m| (bytes + m.len(), count + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];

    /// A tiny local HTTP server so downloads are tested without a network.
    /// Routes: /ok.png (png), /octet (png as octet-stream), /html (html
    /// claiming image/png), /missing (404), /big (11 MB), /svg.
    async fn serve() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = request.split_whitespace().nth(1).unwrap_or("/").to_string();
                    let (status, ctype, body): (&str, &str, Vec<u8>) = match path.as_str() {
                        "/ok.png" => ("200 OK", "image/png", PNG.to_vec()),
                        "/octet" => ("200 OK", "application/octet-stream", PNG.to_vec()),
                        "/html" => (
                            "200 OK",
                            "image/png",
                            b"<!DOCTYPE html><html>nope</html>".to_vec(),
                        ),
                        "/svg" => (
                            "200 OK",
                            "image/svg+xml",
                            b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
                        ),
                        "/big" => ("200 OK", "image/png", vec![0x89; 11 * 1024 * 1024]),
                        _ => ("404 Not Found", "text/plain", b"no".to_vec()),
                    };
                    let head = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    let _ = socket.write_all(&body).await;
                });
            }
        });
        format!("http://{addr}")
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yomu-imgcache-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn file_names_are_stable_and_safe() {
        assert_eq!(file_stem("https://a/b.png"), file_stem("https://a/b.png"));
        assert_ne!(file_stem("https://a/b.png"), file_stem("https://a/c.png"));
        assert_eq!(file_stem("x").len(), 32);
        assert!(file_stem("../../etc/passwd")
            .chars()
            .all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn mime_and_sniffing() {
        assert_eq!(ext_for_mime("image/JPEG; charset=x"), Some("jpg"));
        assert_eq!(ext_for_mime("text/html"), None);
        assert_eq!(sniff_ext(PNG), Some("png"));
        assert_eq!(sniff_ext(b"<?xml version='1.0'?><svg/>"), Some("svg"));
        assert_eq!(sniff_ext(b"<html></html>"), None);
    }

    #[tokio::test]
    async fn downloads_images_and_skips_everything_else() {
        let base = serve().await;
        let dir = temp_dir("dl");
        let client = reqwest::Client::new();
        let urls: Vec<String> = ["/ok.png", "/octet", "/html", "/missing", "/svg", "/big"]
            .iter()
            .map(|p| format!("{base}{p}"))
            .chain([
                "file:///etc/passwd".to_string(),
                "data:image/png;base64,AAAA".to_string(),
            ])
            .collect();

        let files = cache_images(&client, &dir, &urls).await.unwrap();

        assert!(
            files[0].as_deref().is_some_and(|f| f.ends_with(".png")),
            "png"
        );
        assert!(
            files[1].as_deref().is_some_and(|f| f.ends_with(".png")),
            "octet-stream sniffed as png"
        );
        assert_eq!(files[2], None, "html pretending to be an image");
        assert_eq!(files[3], None, "404");
        assert!(
            files[4].as_deref().is_some_and(|f| f.ends_with(".svg")),
            "svg"
        );
        assert_eq!(files[5], None, "over the size cap");
        assert_eq!(files[6], None, "file: URLs are never fetched");
        assert_eq!(files[7], None, "data: URLs are not downloaded");
        // Bytes on disk are exactly what was served, and no .part files remain.
        let saved = std::fs::read(dir.join(files[0].as_ref().unwrap())).unwrap();
        assert_eq!(saved, PNG);
        assert!(std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .all(|e| !e.file_name().to_string_lossy().ends_with(".part")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn an_already_cached_image_is_not_downloaded_again() {
        let base = serve().await;
        let dir = temp_dir("again");
        let client = reqwest::Client::new();
        let urls = vec![format!("{base}/ok.png")];
        let first = cache_images(&client, &dir, &urls).await.unwrap();
        // A dead client proves the second call never touches the network.
        let offline = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all("http://127.0.0.1:9").unwrap())
            .build()
            .unwrap();
        let second = cache_images(&offline, &dir, &urls).await.unwrap();
        assert_eq!(first, second);
        assert!(second[0].is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn loads_a_png_for_the_agent_as_base64() {
        use base64::Engine;
        let base = serve().await;
        let dir = temp_dir("agent");
        let client = reqwest::Client::new();
        let image = load_for_agent(&client, &dir, &format!("{base}/ok.png"))
            .await
            .unwrap();
        assert_eq!(image.mime, "image/png");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&image.base64)
            .unwrap();
        assert_eq!(decoded, PNG);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn refuses_images_the_agent_cannot_use_with_a_helpful_reason() {
        let base = serve().await;
        let dir = temp_dir("agent-refuse");
        let client = reqwest::Client::new();
        let svg = load_for_agent(&client, &dir, &format!("{base}/svg"))
            .await
            .unwrap_err();
        assert!(svg.contains("SVG"), "{svg}");
        let missing = load_for_agent(&client, &dir, &format!("{base}/missing"))
            .await
            .unwrap_err();
        assert!(missing.contains("download"), "{missing}");
        let file = load_for_agent(&client, &dir, "file:///etc/passwd")
            .await
            .unwrap_err();
        assert!(file.contains("web images"), "{file}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_big_image_is_shrunk_to_a_jpeg_within_the_limit() {
        let img = image::RgbImage::from_fn(3000, 2000, |x, y| {
            image::Rgb([(x % 251) as u8, (y % 241) as u8, ((x * y) % 239) as u8])
        });
        let mut png = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let out = shrink(&png, 5 * 1024 * 1024).expect("shrinks");
        let small = image::load_from_memory(&out).unwrap();
        assert_eq!(small.width().max(small.height()), SHRUNK_SIDE);
        assert!(shrink(b"not an image", 1000).is_none());
        assert!(shrink(&png, 10).is_none(), "still over the limit");
    }

    #[test]
    fn dir_stats_counts_files_and_bytes() {
        let dir = std::env::temp_dir().join("yomu-dir-stats-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.png"), [0u8; 10]).unwrap();
        std::fs::write(dir.join("b.png"), [0u8; 5]).unwrap();
        std::fs::write(dir.join("sub/c.png"), [0u8; 99]).unwrap(); // not counted
        assert_eq!(dir_stats(&dir), (15, 2));
        assert_eq!(dir_stats(&dir.join("missing")), (0, 0));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn eviction_removes_the_oldest_files_first() {
        let dir = temp_dir("evict");
        std::fs::create_dir_all(&dir).unwrap();
        let now = std::time::SystemTime::now();
        for (name, age_secs) in [("old.png", 300), ("mid.png", 200), ("new.png", 100)] {
            let path = dir.join(name);
            std::fs::write(&path, [0u8; 10]).unwrap();
            let file = std::fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(now - std::time::Duration::from_secs(age_secs))
                .unwrap();
        }
        evict_over(&dir, 20);
        assert!(!dir.join("old.png").exists());
        assert!(dir.join("mid.png").exists() && dir.join("new.png").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_removes_only_files_not_kept() {
        let dir = temp_dir("prune");
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["keep.png", "drop1.png", "drop2.jpg"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        assert_eq!(prune(&dir, &["keep.png".to_string()]), 2);
        assert!(dir.join("keep.png").exists());
        assert!(!dir.join("drop1.png").exists());
        assert_eq!(prune(&dir.join("does-not-exist"), &[]), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Opt-in, hits the real internet: scrapes real pages and caches their
/// images into a temp dir. `cargo test real_images -- --ignored --nocapture`
#[cfg(test)]
mod real_world {
    #[tokio::test]
    #[ignore]
    async fn real_images() {
        let client = crate::scraper::http_client().unwrap();
        let dir = std::env::temp_dir().join("yomu-real-images");
        let _ = std::fs::remove_dir_all(&dir);
        for page in [
            "https://en.wikipedia.org/wiki/Rust_(programming_language)",
            "https://medium.com/data-science-collective/ai-hallucination-is-nothing-but-a-plausible-prediction-gone-wrong-10d0b6a33209",
            "https://react.dev/learn/thinking-in-react",
            "https://kubernetes.io/docs/concepts/workloads/pods/",
        ] {
            let article = crate::scraper::scrape(page, None).await.unwrap();
            let urls: Vec<String> = article
                .blocks
                .iter()
                .filter_map(|b| match b {
                    crate::scraper::Block::Image { src, .. } => Some(src.clone()),
                    _ => None,
                })
                .collect();
            let started = std::time::Instant::now();
            let files = super::cache_images(&client, &dir, &urls).await.unwrap();
            println!("REAL {page}");
            for (url, file) in urls.iter().zip(&files) {
                let size = file
                    .as_ref()
                    .and_then(|f| std::fs::metadata(dir.join(f)).ok())
                    .map(|m| m.len());
                println!("   {:>9?} bytes  {:?}  <- {}", size, file, &url[..url.len().min(90)]);
            }
            println!("   ({} ms)", started.elapsed().as_millis());
        }
    }
}

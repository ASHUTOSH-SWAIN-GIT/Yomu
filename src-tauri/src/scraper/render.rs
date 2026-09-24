//! Fallback for pages a plain HTTP fetch can't read: JavaScript rendered
//! content, and sites that block non-browser clients (Medium answers with a
//! Cloudflare 403). We load the page in a hidden webview, let it render,
//! and take the resulting HTML.
//!
//! Getting HTML *out* of a remote page is the awkward part: remote pages
//! must not get Tauri IPC (this window is not in any capability, so it has
//! none), and `eval` can't return values. So an injected script "navigates"
//! to `yomu-capture://...` URLs carrying the HTML in chunks, and Rust
//! intercepts and cancels each navigation. The page never gains any access.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use super::ScrapeError;

const SCHEME: &str = "yomu-capture";
/// Overall budget: page load, JS rendering, and sending the HTML back.
const TIMEOUT: Duration = Duration::from_secs(30);

/// Runs inside the remote page. Waits for the text to stop changing (JS
/// frameworks render late), strips heavy elements, then sends the HTML out
/// in URL-sized chunks, paced so each navigation is seen separately.
const CAPTURE_SCRIPT: &str = r#"
(() => {
  if (window.top !== window || window.__yomuCapture) return;
  window.__yomuCapture = true;
  const started = Date.now();
  let last = -1, stable = 0;

  function send() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,iframe,link,template,canvas,video,audio")
      .forEach((e) => e.remove());
    // Capped so the hand-back stays within a few navigations (the webview
    // stops delivering after about ten rapid ones).
    const html = ("<!doctype html>" + clone.outerHTML).slice(0, 1500000);
    const size = Math.max(60000, Math.ceil(html.length / 8));

    // Split the RAW text, then encode each piece on its own. Splitting the
    // encoded string would cut multi-byte characters across two chunks.
    const parts = [];
    for (let pos = 0; pos < html.length; ) {
      let end = Math.min(html.length, pos + size);
      const last = html.charCodeAt(end - 1);
      if (end < html.length && last >= 0xd800 && last <= 0xdbff) end -= 1; // keep surrogate pairs whole
      parts.push(html.slice(pos, end));
      pos = end;
    }

    let i = 0;
    (function next() {
      if (i >= parts.length) return;
      window.location.href = "yomu-capture://x/?i=" + i + "&n=" + parts.length +
        "&d=" + encodeURIComponent(parts[i]);
      i += 1;
      setTimeout(next, 150);
    })();
  }

  function tick() {
    const len = ((document.body && document.body.innerText) || "").length;
    stable = len === last ? stable + 1 : 0;
    last = len;
    const settled = len > 800 && stable >= 2;
    if (settled || Date.now() - started > 15000) return send();
    setTimeout(tick, 500);
  }

  if (document.readyState === "complete") setTimeout(tick, 300);
  else window.addEventListener("load", () => setTimeout(tick, 300));
})();
"#;

/// Reassembles the chunks the page sends. Chunks may arrive in any order.
#[derive(Default)]
struct Assembler {
    parts: Vec<Option<String>>,
}

impl Assembler {
    /// Records chunk `i` of `n`. Returns the full text once all are in.
    fn push(&mut self, i: usize, n: usize, data: String) -> Option<String> {
        if n == 0 || i >= n {
            return None;
        }
        if self.parts.len() != n {
            self.parts = vec![None; n];
        }
        self.parts[i] = Some(data);
        if self.parts.iter().all(Option::is_some) {
            Some(self.parts.iter().flatten().map(String::as_str).collect())
        } else {
            None
        }
    }
}

/// Handles one navigation. Returns `true` to allow it (normal page
/// navigation), `false` to cancel it (our capture URLs).
fn handle_navigation(
    url: &url::Url,
    assembler: &Mutex<Assembler>,
    done: &Mutex<Option<oneshot::Sender<String>>>,
) -> bool {
    if url.scheme() != SCHEME {
        return true;
    }
    let (mut i, mut n, mut data) = (None, None, None);
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "i" => i = value.parse::<usize>().ok(),
            "n" => n = value.parse::<usize>().ok(),
            "d" => data = Some(value.into_owned()),
            _ => {}
        }
    }
    if let (Some(i), Some(n), Some(data)) = (i, n, data) {
        let complete = assembler.lock().ok().and_then(|mut a| a.push(i, n, data));
        if let Some(html) = complete {
            if let Some(tx) = done.lock().ok().and_then(|mut d| d.take()) {
                let _ = tx.send(html);
            }
        }
    }
    false
}

/// Bot-check and interstitial pages that a browser can get stuck on.
/// Extracting these as if they were the article would be worse than failing.
pub fn looks_like_bot_check(html: &str) -> bool {
    let lower: String = html.chars().take(4000).collect::<String>().to_lowercase();
    [
        "just a moment",
        "attention required",
        "verify you are human",
        "access denied",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

/// Loads `url` in a hidden webview and returns its rendered HTML.
pub async fn render_html(app: &AppHandle, url: &str) -> Result<String, ScrapeError> {
    let parsed = url::Url::parse(url)?;
    let (tx, rx) = oneshot::channel();
    let done = Arc::new(Mutex::new(Some(tx)));
    let assembler = Arc::new(Mutex::new(Assembler::default()));

    let label = format!(
        "scrape-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );

    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .initialization_script(CAPTURE_SCRIPT)
        .on_navigation(move |nav_url| handle_navigation(nav_url, &assembler, &done))
        .build()
        .map_err(|e| ScrapeError::Render(e.to_string()))?;

    let result = tokio::time::timeout(TIMEOUT, rx).await;
    // Always close the hidden window, whatever happened.
    let _ = window.destroy();

    match result {
        Ok(Ok(html)) => Ok(html),
        Ok(Err(_)) => Err(ScrapeError::Render("the page closed early".into())),
        Err(_) => Err(ScrapeError::Render(
            "the page took too long to render".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembler_joins_chunks_in_order_even_if_they_arrive_out_of_order() {
        let mut a = Assembler::default();
        assert_eq!(a.push(1, 3, "B".into()), None);
        assert_eq!(a.push(0, 3, "A".into()), None);
        assert_eq!(a.push(2, 3, "C".into()), Some("ABC".into()));
    }

    #[test]
    fn assembler_ignores_invalid_chunk_numbers() {
        let mut a = Assembler::default();
        assert_eq!(a.push(5, 3, "x".into()), None);
        assert_eq!(a.push(0, 0, "x".into()), None);
    }

    fn navigate(url: &str) -> (bool, Option<String>) {
        let (tx, mut rx) = oneshot::channel();
        let done = Mutex::new(Some(tx));
        let assembler = Mutex::new(Assembler::default());
        let allowed = handle_navigation(&url::Url::parse(url).unwrap(), &assembler, &done);
        (allowed, rx.try_recv().ok())
    }

    #[test]
    fn capture_navigations_are_cancelled_and_decoded() {
        let (allowed, html) = navigate("yomu-capture://x/?i=0&n=1&d=%3Cp%3Ehi%20there%3C%2Fp%3E");
        assert!(!allowed, "capture URLs must never actually navigate");
        assert_eq!(html.as_deref(), Some("<p>hi there</p>"));
    }

    #[test]
    fn multibyte_text_survives_when_each_chunk_is_encoded_on_its_own() {
        // "café 日本" split between "caf" and "é 日本": the two halves are
        // percent-encoded separately, exactly as the injected script does.
        let assembler = Mutex::new(Assembler::default());
        let (tx, mut rx) = oneshot::channel();
        let done = Mutex::new(Some(tx));
        for (i, part) in ["caf", "%C3%A9%20%E6%97%A5%E6%9C%AC"].iter().enumerate() {
            let url = url::Url::parse(&format!("yomu-capture://x/?i={i}&n=2&d={part}")).unwrap();
            assert!(!handle_navigation(&url, &assembler, &done));
        }
        assert_eq!(rx.try_recv().unwrap(), "café 日本");
    }

    #[test]
    fn normal_navigations_are_allowed() {
        assert!(navigate("https://example.com/page").0);
    }

    #[test]
    fn malformed_capture_urls_are_cancelled_without_a_result() {
        let (allowed, html) = navigate("yomu-capture://x/?i=zero&n=1");
        assert!(!allowed);
        assert_eq!(html, None);
    }

    #[test]
    fn detects_bot_check_pages() {
        assert!(looks_like_bot_check("<title>Just a moment...</title>"));
        assert!(looks_like_bot_check(
            "<title>Attention Required! | Cloudflare</title>"
        ));
        assert!(!looks_like_bot_check("<title>How ownership works</title>"));
    }
}

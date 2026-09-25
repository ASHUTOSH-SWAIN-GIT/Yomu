use std::time::Duration;

use encoding_rs::Encoding;

use super::ScrapeError;

// A realistic desktop browser UA. Some sites (Medium in particular) block
// or serve a stripped down page to unrecognized clients.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/// Retries on timeouts, connection failures, and these transient statuses.
/// Never retries a real 4xx (403/404 etc. mean asking again won't help).
const RETRYABLE_STATUSES: [u16; 3] = [502, 503, 504];
const RETRY_DELAYS: [Duration; 2] = [Duration::from_millis(300), Duration::from_millis(900)];

#[derive(Debug)]
pub struct Fetched {
    pub final_url: String,
    pub html: String,
}

pub fn build_client() -> Result<reqwest::Client, ScrapeError> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(ScrapeError::from)
}

/// Fetches a page as plain HTTP, retrying transient failures. Returns the
/// final URL after redirects (used as the canonical source) along with the
/// HTML body, decoded with the page's declared character encoding.
pub async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<Fetched, ScrapeError> {
    let mut attempt = 0;
    loop {
        match fetch_once(client, url).await {
            Ok(fetched) => return Ok(fetched),
            Err(err) if attempt < RETRY_DELAYS.len() && is_retryable(&err) => {
                tokio::time::sleep(RETRY_DELAYS[attempt]).await;
                attempt += 1;
            }
            Err(err) => return Err(err),
        }
    }
}

fn is_retryable(err: &ScrapeError) -> bool {
    match err {
        ScrapeError::HttpStatus(status) => RETRYABLE_STATUSES.contains(status),
        ScrapeError::Network(e) => e.is_timeout() || e.is_connect(),
        _ => false,
    }
}

async fn fetch_once(client: &reqwest::Client, url: &str) -> Result<Fetched, ScrapeError> {
    let response = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(ScrapeError::HttpStatus(response.status().as_u16()));
    }

    let final_url = response.url().to_string();
    let header_charset = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(charset_from_content_type);
    let bytes = response.bytes().await?;
    let html = decode_body(&bytes, header_charset.as_deref());
    Ok(Fetched { final_url, html })
}

/// Pulls `charset=...` out of a `Content-Type` header value.
fn charset_from_content_type(content_type: &str) -> Option<String> {
    let lower = content_type.to_ascii_lowercase();
    let idx = lower.find("charset=")?;
    let rest = &content_type[idx + "charset=".len()..];
    let rest = rest.trim_matches(['"', '\'']);
    let end = rest
        .find(|c: char| c == ';' || c.is_whitespace())
        .unwrap_or(rest.len());
    let label = rest[..end].trim();
    (!label.is_empty()).then(|| label.to_string())
}

/// Pulls a declared charset out of `<meta charset="...">` or
/// `<meta http-equiv="Content-Type" content="...charset=...">`, scanning the
/// first couple KB (where `<head>` lives) as raw bytes: the markers we look
/// for are pure ASCII, which is byte-stable across every encoding a real
/// page would declare, so this is safe even before we know the real charset.
fn sniff_meta_charset(bytes: &[u8]) -> Option<String> {
    let window = &bytes[..bytes.len().min(2048)];
    let text = String::from_utf8_lossy(window).to_ascii_lowercase();

    if let Some(idx) = text.find("charset=") {
        let rest = &text[idx + "charset=".len()..];
        let rest = rest.trim_start_matches(['"', '\'', ' ']);
        let end = rest
            .find(|c: char| c == '"' || c == '\'' || c == '>' || c == ';' || c.is_whitespace())
            .unwrap_or(rest.len());
        let label = rest[..end].trim();
        if !label.is_empty() {
            return Some(label.to_string());
        }
    }
    None
}

/// Decodes a response body using its declared encoding: the `Content-Type`
/// header first, then a `<meta charset>` sniff, falling back to UTF-8 (lossy
/// on invalid bytes, same as the previous behaviour) when neither is present
/// or the label isn't recognized.
fn decode_body(bytes: &[u8], header_charset: Option<&str>) -> String {
    let label = header_charset
        .map(str::to_string)
        .or_else(|| sniff_meta_charset(bytes));
    let encoding = label
        .as_deref()
        .and_then(|l| Encoding::for_label(l.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    encoding.decode(bytes).0.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn reads_charset_from_a_content_type_header() {
        assert_eq!(
            charset_from_content_type("text/html; charset=ISO-8859-1"),
            Some("ISO-8859-1".to_string())
        );
        assert_eq!(
            charset_from_content_type("text/html;charset=\"windows-1252\""),
            Some("windows-1252".to_string())
        );
        assert_eq!(charset_from_content_type("text/html"), None);
    }

    #[test]
    fn sniffs_charset_from_a_meta_tag_when_the_header_has_none() {
        let html = b"<html><head><meta charset=\"iso-8859-1\"></head></html>";
        assert_eq!(sniff_meta_charset(html), Some("iso-8859-1".to_string()));

        let http_equiv =
            b"<meta http-equiv=\"Content-Type\" content=\"text/html; charset=windows-1252\">";
        assert_eq!(
            sniff_meta_charset(http_equiv),
            Some("windows-1252".to_string())
        );

        assert_eq!(sniff_meta_charset(b"<html><head></head></html>"), None);
    }

    #[test]
    fn decodes_non_utf8_bytes_using_the_declared_charset() {
        // 'é' in latin-1 (ISO-8859-1) is a single byte, 0xE9 — invalid UTF-8
        // on its own, so decoding as UTF-8 would show a replacement glyph.
        let latin1 = [b'c', b'a', 0xE9];
        assert_eq!(decode_body(&latin1, Some("iso-8859-1")), "caé");
        // Without any charset info, the old UTF-8-lossy behaviour is kept.
        assert_eq!(decode_body(&latin1, None), "ca\u{FFFD}");
    }

    #[test]
    fn falls_back_to_utf8_for_an_unrecognized_label() {
        assert_eq!(decode_body(b"hello", Some("not-a-real-charset")), "hello");
    }

    /// A tiny local HTTP server so retry and encoding are tested without a
    /// network. `responses` is served once per connection, in order, then
    /// the last one repeats.
    type Response = (u16, Vec<(&'static str, &'static str)>, Vec<u8>);

    async fn serve(responses: Vec<Response>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut step = 0;
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let (status, headers, body) = responses[step.min(responses.len() - 1)].clone();
                step += 1;
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let _ = socket.read(&mut buf).await;
                    let reason = match status {
                        200 => "OK",
                        502 => "Bad Gateway",
                        503 => "Service Unavailable",
                        _ => "Error",
                    };
                    let header_lines: String = headers
                        .iter()
                        .map(|(k, v)| format!("{k}: {v}\r\n"))
                        .collect();
                    let head = format!(
                        "HTTP/1.1 {status} {reason}\r\n{header_lines}Content-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    let _ = socket.write_all(&body).await;
                });
            }
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn retries_a_503_then_succeeds() {
        let base = serve(vec![
            (503, vec![], b"try again".to_vec()),
            (
                200,
                vec![("Content-Type", "text/html")],
                b"<p>ok</p>".to_vec(),
            ),
        ])
        .await;
        let client = build_client().unwrap();
        let fetched = fetch_html(&client, &base).await.unwrap();
        assert_eq!(fetched.html, "<p>ok</p>");
    }

    #[tokio::test]
    async fn does_not_retry_a_real_client_error() {
        let base = serve(vec![(404, vec![], b"nope".to_vec())]).await;
        let client = build_client().unwrap();
        let err = fetch_html(&client, &base).await.unwrap_err();
        assert!(matches!(err, ScrapeError::HttpStatus(404)));
    }

    #[tokio::test]
    async fn decodes_a_real_response_using_its_content_type_header() {
        let latin1_body = vec![b'c', b'a', 0xE9]; // "caé" in ISO-8859-1
        let base = serve(vec![(
            200,
            vec![("Content-Type", "text/plain; charset=iso-8859-1")],
            latin1_body,
        )])
        .await;
        let client = build_client().unwrap();
        let fetched = fetch_html(&client, &base).await.unwrap();
        assert_eq!(fetched.html, "caé");
    }
}

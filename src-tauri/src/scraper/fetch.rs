use std::time::Duration;

use super::ScrapeError;

// A realistic desktop browser UA. Some sites (Medium in particular) block
// or serve a stripped down page to unrecognized clients.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

/// Fetches a page as plain HTTP. Returns the final URL after redirects
/// (used as the canonical source) along with the raw HTML body.
pub async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<Fetched, ScrapeError> {
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
    let html = response.text().await?;
    Ok(Fetched { final_url, html })
}

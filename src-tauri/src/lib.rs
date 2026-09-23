mod db;
mod scraper;

use scraper::ScrapedArticle;

#[tauri::command]
async fn scrape_url(url: String) -> Result<ScrapedArticle, String> {
    scraper::scrape(&url).await.map_err(|e| e.to_string())
}

/// Normalizes a URL without a network round trip, so the frontend can
/// check the local cache before deciding whether to call `scrape_url`.
#[tauri::command]
fn canonicalize_url(url: String) -> Result<String, String> {
    scraper::canonical_url(&url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![scrape_url, canonicalize_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

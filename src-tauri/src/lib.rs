mod scraper;

use scraper::ScrapedArticle;

#[tauri::command]
async fn scrape_url(url: String) -> Result<ScrapedArticle, String> {
    scraper::scrape(&url).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scrape_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

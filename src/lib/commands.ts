import { invoke } from "@tauri-apps/api/core";
import type { ScrapedArticle } from "@/types/article";

/**
 * Thin wrappers around Tauri commands (`src-tauri/src/lib.rs`). Keep all
 * `invoke` calls behind this module so command names and payload shapes
 * only need to be updated in one place.
 */
export async function scrapeUrl(url: string): Promise<ScrapedArticle> {
  return invoke<ScrapedArticle>("scrape_url", { url });
}

/** Normalizes a URL with no network round trip, for cache lookups. */
export async function canonicalizeUrl(url: string): Promise<string> {
  return invoke<string>("canonicalize_url", { url });
}

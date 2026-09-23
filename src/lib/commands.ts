import { invoke } from "@tauri-apps/api/core";
import type { ScrapedArticle } from "@/types/article";
import type { AgentStatus } from "@/types/agent";

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

export async function agentStatus(): Promise<AgentStatus> {
  return invoke<AgentStatus>("agent_status");
}

/** Kicks off `codex login`; the caller re-polls agentStatus afterwards. */
export async function agentLogin(): Promise<void> {
  return invoke("agent_login");
}

/** Opens a new ACP session in a fresh, empty temp directory. */
export async function agentNewSession(): Promise<string> {
  return invoke<string>("agent_new_session");
}

export async function agentPrompt(
  sessionId: string,
  text: string,
): Promise<void> {
  return invoke("agent_prompt", { sessionId, text });
}

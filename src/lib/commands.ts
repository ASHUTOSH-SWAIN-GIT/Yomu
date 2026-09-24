import { invoke } from "@tauri-apps/api/core";
import type { ScrapedArticle } from "@/types/article";
import type { Diagnosis } from "@/types/agent";

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

/** What's installed (Node, Codex) and whether Codex is signed in. */
export async function agentDiagnose(): Promise<Diagnosis> {
  return invoke<Diagnosis>("agent_diagnose");
}

/** Kicks off `codex login`; the caller re-polls agentStatus afterwards. */
export async function agentLogin(): Promise<void> {
  return invoke("agent_login");
}

/** Opens a new ACP session in a fresh, empty temp directory. */
export async function agentNewSession(): Promise<string> {
  return invoke<string>("agent_new_session");
}

/** Re-attaches to a session from an earlier app run; rejects if the agent
 * no longer has it, in which case the caller opens a new one. */
export async function agentResumeSession(sessionId: string): Promise<void> {
  return invoke("agent_resume_session", { sessionId });
}

/** Starts the agent in the background so the first Explain is fast. */
export async function agentWarm(): Promise<void> {
  return invoke("agent_warm");
}

/** Stops the turn in flight; the streamed text so far is kept. */
export async function agentCancel(sessionId: string): Promise<void> {
  return invoke("agent_cancel", { sessionId });
}

export async function agentPrompt(
  sessionId: string,
  text: string,
): Promise<void> {
  return invoke("agent_prompt", { sessionId, text });
}

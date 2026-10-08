import { invoke } from "@tauri-apps/api/core";
import type { ScrapedArticle } from "@/types/article";
import type {
  AgentConfig,
  AgentModel,
  Diagnosis,
  StorageInfo,
} from "@/types/agent";

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

/** Downloads images into the offline cache. Returns a file name per URL
 * (same order), or null where one could not be saved. */
export async function cacheImages(urls: string[]): Promise<(string | null)[]> {
  return invoke<(string | null)[]>("cache_images", { urls });
}

/** Names of the files still in the image cache. */
export async function cachedImageNames(): Promise<string[]> {
  return invoke<string[]>("cached_image_names");
}

/** Absolute path of the folder holding cached images. */
export async function imageCacheDir(): Promise<string> {
  return invoke<string>("image_cache_dir");
}

/** Where Yomu keeps its data and how large it is. */
export async function storageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>("storage_info");
}

/** Deletes cached images not in `keep`; returns how many were removed. */
export async function pruneImages(keep: string[]): Promise<number> {
  return invoke<number>("prune_images", { keep });
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

/** Switches to the chosen agent and starts it; rejects if it cannot start. */
export async function agentUse(config: AgentConfig): Promise<void> {
  return invoke("agent_use", { config });
}

/** Where a command is found on this computer, or null. */
export async function agentFindCommand(
  command: string,
): Promise<string | null> {
  return invoke<string | null>("agent_find_command", { command });
}

/** The models the account can use. */
export async function agentListModels(): Promise<AgentModel[]> {
  return invoke<AgentModel[]>("agent_list_models");
}

/** Moves a live session to a model the user picked. */
export async function agentSetModel(
  sessionId: string,
  modelId: string,
): Promise<void> {
  return invoke("agent_set_model", { sessionId, modelId });
}

/** Starts the agent in the background so the first Explain is fast. */
export async function agentWarm(): Promise<void> {
  return invoke("agent_warm");
}

/** Whether the agent runs inside an operating-system sandbox here. */
export async function agentSandboxed(): Promise<boolean> {
  return invoke<boolean>("agent_sandboxed");
}

/** Stops the turn in flight; the streamed text so far is kept. */
export async function agentCancel(sessionId: string): Promise<void> {
  return invoke("agent_cancel", { sessionId });
}

/** Sends a prompt. With `imageUrl`, that image (from the offline cache, or
 * downloaded now) is attached for the agent to look at. */
export async function agentPrompt(
  sessionId: string,
  text: string,
  imageUrl?: string,
): Promise<void> {
  return invoke("agent_prompt", {
    sessionId,
    text,
    imageUrl: imageUrl ?? null,
  });
}

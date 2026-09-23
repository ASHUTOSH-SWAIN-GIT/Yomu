import { listen } from "@tauri-apps/api/event";
import type { AgentEvent } from "@/types/agent";

/** Subscribes to streamed agent events emitted by the Rust side (see
 * src-tauri/src/lib.rs's forwarding task). Callers filter by session_id
 * themselves — every session's events arrive on the same channel. */
export function onAgentEvent(handler: (event: AgentEvent) => void) {
  return listen<AgentEvent>("agent-event", (e) => handler(e.payload));
}

import { useUiStore } from "@/stores/ui-store";

/** The model the user picked in the chat, if any. It goes along with
 * `agentNewSession` / `agentResumeSession`, which start the session on it in
 * one step (a model that no longer works is not fatal: Yomu's own fallback
 * still moves the chat to one that does). */
export function chosenModel(): string | null {
  return useUiStore.getState().chatModel;
}

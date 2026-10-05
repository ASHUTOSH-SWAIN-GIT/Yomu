import { agentSetModel } from "@/lib/commands";
import { logError } from "@/lib/log";
import { useUiStore } from "@/stores/ui-store";

/** Puts a session on the model the user picked in the chat, if they picked
 * one. A model that no longer works is not fatal: Yomu's own fallback still
 * moves the chat to one that does. */
export async function applyChosenModel(sessionId: string) {
  const model = useUiStore.getState().chatModel;
  if (!model) return;
  try {
    await agentSetModel(sessionId, model);
  } catch (err) {
    logError("could not use the chosen model", err);
  }
}

import { useModelsStore } from "@/stores/models-store";
import { useUiStore } from "@/stores/ui-store";

/** The model the user picked in the chat, if any. It goes along with
 * `agentNewSession` / `agentResumeSession`, which start the session on it in
 * one step (a model that no longer works is not fatal: Yomu's own fallback
 * still moves the chat to one that does). */
export function chosenModel(): string | null {
  return useUiStore.getState().chatModel;
}

/**
 * Acts on the model the account was just refused ("not supported on your
 * plan"): it is not offered again (lib/unusable-models.ts remembers it), and
 * the picker falls back to Auto rather than keeping a choice that cannot run.
 * Nothing is hidden when the chat was on Auto, because the model that failed
 * was not one the reader picked.
 */
export function forgetRefusedModel() {
  const chosen = chosenModel();
  if (!chosen) return;
  useModelsStore.getState().hide(chosen);
  useUiStore.getState().setChatModel(null);
}

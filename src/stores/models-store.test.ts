import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  answers: [] as { resolve: (m: unknown[]) => void }[],
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  agentListModels: () => new Promise((resolve) => h.answers.push({ resolve })),
}));

import { useModelsStore } from "@/stores/models-store";

const model = (id: string) => ({ id, name: id, description: "" });

beforeEach(() => {
  h.answers = [];
  useModelsStore.getState().clear();
});

describe("models store", () => {
  it("asks the agent once and keeps the answer", async () => {
    const first = useModelsStore.getState().load();
    h.answers[0].resolve([model("a")]);
    await first;
    await useModelsStore.getState().load();
    expect(h.answers).toHaveLength(1);
    expect(useModelsStore.getState().models?.[0].id).toBe("a");
  });

  it("forgets the list when the agent changes", async () => {
    const first = useModelsStore.getState().load();
    h.answers[0].resolve([model("codex-model")]);
    await first;
    useModelsStore.getState().clear();
    expect(useModelsStore.getState().models).toBeNull();
    const second = useModelsStore.getState().load();
    h.answers[1].resolve([model("opencode-model")]);
    await second;
    expect(useModelsStore.getState().models?.[0].id).toBe("opencode-model");
  });

  it("ignores a late answer from the agent that was switched away from", async () => {
    const stale = useModelsStore.getState().load();
    useModelsStore.getState().clear(); // the user switched agent meanwhile
    h.answers[0].resolve([model("old-agent-model")]);
    await stale;
    expect(useModelsStore.getState().models).toBeNull();
  });
});

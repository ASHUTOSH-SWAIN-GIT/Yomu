import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "@/types/agent";

const h = vi.hoisted(() => ({
  answers: [] as { resolve: (m: unknown[]) => void }[],
  disk: new Map<string, string>(),
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  agentListModels: () => new Promise((resolve) => h.answers.push({ resolve })),
}));
vi.mock("@/lib/storage", () => ({
  readStorage: (k: string) => h.disk.get(k) ?? null,
  writeStorage: (k: string, v: string) => void h.disk.set(k, v),
}));

import { useModelsStore } from "@/stores/models-store";

const model = (id: string) => ({ id, name: id, description: "" });
const ids = (models: { id: string }[] | null) =>
  models?.map((m) => m.id) ?? null;

const CODEX: AgentConfig = { kind: "codex" };
const OPENCODE: AgentConfig = {
  kind: "custom",
  command: "opencode",
  args: ["acp"],
  dataDirs: [],
};

beforeEach(() => {
  h.answers = [];
  h.disk.clear();
  useModelsStore.getState().clear();
  useModelsStore.setState({ unusable: [], unusableFor: null });
});

describe("models store", () => {
  it("asks the agent once and keeps the answer", async () => {
    const first = useModelsStore.getState().load(CODEX);
    h.answers[0].resolve([model("a")]);
    await first;
    await useModelsStore.getState().load(CODEX);
    expect(h.answers).toHaveLength(1);
    expect(useModelsStore.getState().models?.[0].id).toBe("a");
  });

  it("forgets the list when the agent changes", async () => {
    const first = useModelsStore.getState().load(CODEX);
    h.answers[0].resolve([model("codex-model")]);
    await first;
    useModelsStore.getState().clear();
    expect(useModelsStore.getState().models).toBeNull();
    const second = useModelsStore.getState().load(OPENCODE);
    h.answers[1].resolve([model("opencode-model")]);
    await second;
    expect(useModelsStore.getState().models?.[0].id).toBe("opencode-model");
  });

  it("ignores a late answer from the agent that was switched away from", async () => {
    const stale = useModelsStore.getState().load(CODEX);
    useModelsStore.getState().clear(); // the user switched agent meanwhile
    h.answers[0].resolve([model("old-agent-model")]);
    await stale;
    expect(useModelsStore.getState().models).toBeNull();
  });
});

describe("models an account was refused", () => {
  async function loaded(config: AgentConfig, list: { id: string }[]) {
    const answer = useModelsStore.getState().load(config);
    h.answers[h.answers.length - 1].resolve(list);
    await answer;
  }

  it("drops a model the agent turned down, and remembers it next time", async () => {
    await loaded(CODEX, [model("a"), model("b")]);
    useModelsStore.getState().hide("b");
    expect(ids(useModelsStore.getState().models)).toEqual(["a"]);

    // A fresh list from the agent still offers it; the memory wins.
    useModelsStore.getState().clear();
    await loaded(CODEX, [model("a"), model("b")]);
    expect(ids(useModelsStore.getState().models)).toEqual(["a"]);
  });

  it("keeps each agent's refusals to itself", async () => {
    await loaded(CODEX, [model("a"), model("b")]);
    useModelsStore.getState().hide("b");

    useModelsStore.getState().clear();
    await loaded(OPENCODE, [model("a"), model("b")]);
    expect(ids(useModelsStore.getState().models)).toEqual(["a", "b"]);
  });

  it("remembers nothing before it has asked an agent", () => {
    useModelsStore.getState().hide("b");
    expect(h.disk.get("yomu-unusable-models")).toBeUndefined();
  });

  it("survives a corrupt stored value", async () => {
    h.disk.set("yomu-unusable-models", "{nope");
    await loaded(CODEX, [model("a")]);
    expect(ids(useModelsStore.getState().models)).toEqual(["a"]);
  });
});

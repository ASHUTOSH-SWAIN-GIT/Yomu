import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "@/types/agent";

const h = vi.hoisted(() => ({ used: [] as AgentConfig[] }));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  agentUse: async (config: AgentConfig) => void h.used.push(config),
  agentWarm: async () => {},
  agentLogin: async () => {},
  agentDiagnose: async () => ({ node: "v24", codex: "0.1", loggedIn: true }),
}));
vi.mock("@/lib/storage", () => ({
  readStorage: () => null,
  writeStorage: () => {},
}));

import { useAgentStore } from "@/stores/agent-store";
import { useModelsStore } from "@/stores/models-store";
import { useUiStore } from "@/stores/ui-store";

const OPENCODE: AgentConfig = {
  kind: "custom",
  command: "opencode",
  args: ["acp"],
  dataDirs: [],
};

beforeEach(() => {
  h.used = [];
  useAgentStore.setState({ enabled: [], status: "off", asking: null });
});

describe("before an agent is turned on", () => {
  it("starts and checks nothing, Codex included", async () => {
    await useAgentStore.getState().refreshStatus();
    expect(useAgentStore.getState().status).toBe("off");
    expect(h.used).toEqual([]);
  });

  it("starts nothing when a switch is made to an agent that is off", async () => {
    await useAgentStore.getState().setConfig(OPENCODE);
    expect(useAgentStore.getState().status).toBe("off");
    expect(h.used).toEqual([]);
  });

  it("starts the agent once the user turns it on", async () => {
    useAgentStore.getState().ask(OPENCODE);
    await useAgentStore.getState().enable(OPENCODE);
    expect(useAgentStore.getState().asking).toBeNull();
    expect(useAgentStore.getState().enabled).toEqual(["opencode"]);
    expect(h.used).toEqual([OPENCODE]);
    expect(useAgentStore.getState().status).toBe("ready");
  });
});

describe("switching agents", () => {
  it("starts the custom agent, and tells the app to go back to Codex", async () => {
    useAgentStore.setState({ enabled: ["opencode", "codex"] });
    await useAgentStore.getState().setConfig(OPENCODE);
    expect(h.used).toEqual([OPENCODE]);
    expect(useAgentStore.getState().status).toBe("ready");

    await useAgentStore.getState().setConfig({ kind: "codex" });
    // The bug this guards against: choosing Codex saved the choice but left
    // the other agent running, so its models kept showing.
    expect(h.used).toEqual([OPENCODE, { kind: "codex" }]);
    expect(useAgentStore.getState().config.kind).toBe("codex");
  });

  it("forgets the old agent's model list and model choice", async () => {
    useModelsStore.setState({
      models: [{ id: "x", name: "x", description: "" }],
    });
    useUiStore.setState({ chatModel: "some/model" });
    await useAgentStore.getState().setConfig({ kind: "codex" });
    expect(useModelsStore.getState().models).toBeNull();
    expect(useUiStore.getState().chatModel).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { modelsInPlan, parseCommandCodePlan } from "@/lib/command-code-plan";
import type { AgentModel } from "@/types/agent";

const model = (id: string): AgentModel => ({ id, name: id, description: "" });
const ids = (models: AgentModel[]) => models.map((m) => m.id);

/** One model per tier, plus one the catalog does not name. */
const CATALOG = [
  model("deepseek/deepseek-v4-flash"), // Go and above
  model("claude-sonnet-5"), // Pro and above
  model("claude-sonnet-5-5"), // GOAT and above
  model("claude-opus-5-5"), // Max
  model("some/brand-new-model"), // not in the map
];

describe("modelsInPlan", () => {
  it("leaves the list alone when no plan is chosen", () => {
    expect(modelsInPlan(CATALOG, null)).toEqual(CATALOG);
  });

  it("drops the models a cheaper plan does not include", () => {
    expect(ids(modelsInPlan(CATALOG, "go"))).toEqual([
      "deepseek/deepseek-v4-flash",
      "some/brand-new-model",
    ]);
  });

  it("lets a plan use its own tier and every tier below it", () => {
    expect(ids(modelsInPlan(CATALOG, "goat"))).toEqual([
      "deepseek/deepseek-v4-flash",
      "claude-sonnet-5-5",
      "some/brand-new-model",
    ]);
    expect(ids(modelsInPlan(CATALOG, "pro"))).toEqual([
      "deepseek/deepseek-v4-flash",
      "claude-sonnet-5",
      "claude-sonnet-5-5",
      "some/brand-new-model",
    ]);
    // The Max-only models are gated too — the catalog writes their tier
    // as "Max", without the "and above" the others use.
    expect(ids(modelsInPlan(CATALOG, "max"))).toEqual(ids(CATALOG));
    expect(ids(modelsInPlan(CATALOG, "pro"))).not.toContain("claude-opus-5-5");
  });

  it("keeps a model the catalog gained after this snapshot", () => {
    // Hiding a model the reader can use is worse than showing one they cannot.
    const fresh = [model("brand/new-model")];
    expect(modelsInPlan(fresh, "go")).toEqual(fresh);
  });
});

describe("parseCommandCodePlan", () => {
  it("reads a plan it knows", () => {
    expect(parseCommandCodePlan("go")).toBe("go");
    expect(parseCommandCodePlan("max")).toBe("max");
  });

  it("treats anything else as no filter", () => {
    for (const raw of [null, undefined, "", "bogus", "{nope", "PRO"]) {
      expect(parseCommandCodePlan(raw)).toBeNull();
    }
  });
});

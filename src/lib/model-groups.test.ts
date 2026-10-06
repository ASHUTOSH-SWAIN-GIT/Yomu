import { describe, expect, it } from "vitest";
import { defaultVariant, groupModels } from "@/lib/model-groups";
import type { AgentModel } from "@/types/agent";

const m = (id: string, name: string, description = ""): AgentModel => ({
  id,
  name,
  description,
});

describe("groupModels", () => {
  it("folds Codex's effort variants into one entry per model", () => {
    const sections = groupModels([
      m("gpt-6-luna[low]", "6 Luna (low)", "Fast and cheap. Light reasoning"),
      m("gpt-6-luna[medium]", "6 Luna (medium)", "Fast and cheap. Balanced"),
      m("gpt-5.5[low]", "5.5 (low)", "Older. Light"),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    const [luna, older] = sections[0].entries;
    expect(luna.title).toBe("6 Luna");
    expect(luna.description).toBe("Fast and cheap.");
    expect(luna.variants.map((v) => v.label)).toEqual(["low", "medium"]);
    expect(older.title).toBe("5.5");
  });

  it("splits OpenCode's Provider/Model names into a section per provider", () => {
    const sections = groupModels([
      m("opencode/big-pickle", "OpenCode/Big Pickle"),
      m("opencode-go/glm-5.3", "OpenCode Go/GLM-5.3"),
      m("opencode/space-bunny-free", "OpenCode/Space Bunny Free"),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["OpenCode", "OpenCode Go"]);
    expect(sections[0].entries.map((e) => e.title)).toEqual([
      "Big Pickle",
      "Space Bunny Free",
    ]);
    expect(sections[1].entries[0].variants[0].id).toBe("opencode-go/glm-5.3");
  });

  it("keeps a model name that only has a slash inside it whole when it has no provider part", () => {
    const sections = groupModels([m("x", "Plain")]);
    expect(sections[0].entries[0].title).toBe("Plain");
  });
});

describe("defaultVariant", () => {
  it("prefers medium, else the first", () => {
    const entry = {
      key: "k",
      title: "T",
      description: "",
      variants: [
        { id: "a[low]", label: "low" },
        { id: "a[medium]", label: "medium" },
      ],
    };
    expect(defaultVariant(entry)).toBe("a[medium]");
    expect(defaultVariant({ ...entry, variants: [entry.variants[0]] })).toBe(
      "a[low]",
    );
  });
});

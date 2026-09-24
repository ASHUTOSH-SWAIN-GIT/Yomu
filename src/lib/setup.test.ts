import { describe, expect, it } from "vitest";
import { isReady, setupSteps } from "@/lib/setup";
import type { Diagnosis } from "@/types/agent";

const ok: Diagnosis = {
  node: "v22.1.0",
  codex: "codex-cli 0.142.5",
  loggedIn: true,
};

describe("setupSteps", () => {
  it("marks everything done when ready", () => {
    expect(isReady(ok)).toBe(true);
    expect(setupSteps(ok).every((s) => s.done)).toBe(true);
  });

  it("flags each missing prerequisite on its own", () => {
    const done = (d: Diagnosis) => setupSteps(d).map((s) => s.done);
    expect(done({ ...ok, node: null })).toEqual([false, true, true]);
    expect(done({ ...ok, codex: null, loggedIn: false })).toEqual([
      true,
      false,
      false,
    ]);
    expect(done({ ...ok, loggedIn: false })).toEqual([true, true, false]);
  });

  it("is not ready when any single piece is missing", () => {
    expect(isReady({ ...ok, node: null })).toBe(false);
    expect(isReady({ ...ok, codex: null })).toBe(false);
    expect(isReady({ ...ok, loggedIn: false })).toBe(false);
  });

  it("only lets the user sign in once Codex is installed", () => {
    const login = (d: Diagnosis) =>
      setupSteps(d).find((s) => s.id === "login")!;
    expect(
      login({ node: "v22", codex: null, loggedIn: false }).actionable,
    ).toBe(false);
    expect(
      login({ node: "v22", codex: "codex-cli 1", loggedIn: false }).actionable,
    ).toBe(true);
  });

  it("offers a copyable command for installable steps", () => {
    const steps = setupSteps({ node: null, codex: null, loggedIn: false });
    expect(steps.find((s) => s.id === "codex")?.command).toContain(
      "@openai/codex",
    );
    expect(steps.find((s) => s.id === "login")?.command).toBeUndefined();
  });
});

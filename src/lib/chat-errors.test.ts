import { describe, expect, it } from "vitest";
import { classifyError } from "@/lib/chat-errors";

describe("an error from the agent (sorted by the Rust side)", () => {
  it("is used as it came, with the agent's own name in it", () => {
    const sent = {
      kind: "logged_out",
      message: "OpenCode isn't signed in. Sign in to continue.",
    };
    expect(classifyError(sent)).toEqual(sent);
  });

  it("knows the kinds the buttons depend on", () => {
    for (const kind of [
      "usage_limit",
      "model_unavailable",
      "adapter_crashed",
      "adapter_missing",
      "timeout",
      "other",
    ]) {
      expect(classifyError({ kind, message: "m" }).kind).toBe(kind);
    }
  });

  it("is not trusted when it is the wrong shape", () => {
    expect(classifyError({ kind: "bogus", message: "m" }).kind).toBe("other");
    expect(classifyError({ kind: "logged_out" }).kind).toBe("other");
  });
});

describe("any other error (a fallback, sorted by its wording)", () => {
  it.each([
    ["You've hit your usage limit", "usage_limit"],
    ["429 Too Many Requests", "usage_limit"],
    ["not logged in", "logged_out"],
    ["401 Unauthorized", "logged_out"],
    ["agent process exited", "adapter_crashed"],
    ["agent process closed before responding", "adapter_crashed"],
    [
      "could not start the agent (`x`, needs Node/npx): No such file",
      "adapter_missing",
    ],
    ["The agent stopped responding (nothing for 180 seconds).", "timeout"],
    ["something odd happened", "other"],
  ])("%s -> %s", (raw, kind) => {
    expect(classifyError(raw).kind).toBe(kind);
    expect(classifyError(new Error(raw)).kind).toBe(kind);
  });

  it("passes unknown errors through verbatim", () => {
    expect(classifyError("weird").message).toBe("weird");
  });

  it("checks usage limits before generic login wording", () => {
    expect(classifyError("usage limit reached, sign in later").kind).toBe(
      "usage_limit",
    );
  });
});

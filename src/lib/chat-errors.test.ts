import { describe, expect, it } from "vitest";
import { classifyError } from "@/lib/chat-errors";

describe("classifyError", () => {
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
    ["something odd happened", "other"],
  ])("%s -> %s", (raw, kind) => {
    expect(classifyError(raw).kind).toBe(kind);
  });

  it("passes unknown errors through verbatim", () => {
    expect(classifyError("weird").message).toBe("weird");
  });

  it("checks usage limits before generic login wording", () => {
    // "sign in again after your usage limit resets" is a limit, not a login problem.
    expect(classifyError("usage limit reached, sign in later").kind).toBe(
      "usage_limit",
    );
  });
});

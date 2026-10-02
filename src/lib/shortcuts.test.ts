import { describe, expect, it } from "vitest";
import { shortcutFor, type KeyLike } from "@/lib/shortcuts";

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  ...over,
});

describe("shortcutFor", () => {
  it.each([
    ["k", "palette"],
    ["t", "new-tab"],
    ["w", "close-tab"],
    ["b", "toggle-sidebar"],
    ["j", "focus-ask"],
    [".", "focus-mode"],
    ["1", "tab-1"],
    ["9", "tab-9"],
  ])("Cmd+%s is %s", (k, id) => {
    expect(shortcutFor(key(k))).toBe(id);
  });

  it("accepts Ctrl in place of Cmd, and any letter case", () => {
    expect(shortcutFor(key("K", { metaKey: false, ctrlKey: true }))).toBe(
      "palette",
    );
  });

  it("Cmd+Shift+V pastes a link, and other shifted keys do nothing", () => {
    expect(shortcutFor(key("v", { shiftKey: true }))).toBe("paste-link");
    expect(shortcutFor(key("k", { shiftKey: true }))).toBeNull();
  });

  it("ignores keys without Cmd/Ctrl, with Alt, or unknown", () => {
    expect(shortcutFor(key("k", { metaKey: false }))).toBeNull();
    expect(shortcutFor(key("k", { altKey: true }))).toBeNull();
    expect(shortcutFor(key("x"))).toBeNull();
    expect(shortcutFor(key("0"))).toBeNull();
  });

  it("leaves Cmd+E to the Ask bar", () => {
    expect(shortcutFor(key("e"))).toBeNull();
  });
});

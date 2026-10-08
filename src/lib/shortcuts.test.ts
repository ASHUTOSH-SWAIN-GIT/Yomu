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
    [",", "settings"],
    ["b", "toggle-sidebar"],
    ["j", "focus-ask"],
    [".", "focus-mode"],
    ["n", "new-chat"],
    ["e", "toggle-chat"],
    ["/", "shortcuts"],
    ["t", "new-tab"],
    ["w", "close-tab"],
  ])("Cmd+%s is %s", (k, id) => {
    expect(shortcutFor(key(k))).toBe(id);
  });

  it("accepts Ctrl in place of Cmd, and any letter case", () => {
    expect(shortcutFor(key("K", { metaKey: false, ctrlKey: true }))).toBe(
      "palette",
    );
  });

  it("switches tabs with Cmd+Shift+] / [ and Ctrl+Tab", () => {
    expect(shortcutFor(key("}", { shiftKey: true }))).toBe("next-tab");
    expect(shortcutFor(key("[", { shiftKey: true }))).toBe("prev-tab");
    expect(shortcutFor(key("Tab", { metaKey: false, ctrlKey: true }))).toBe(
      "next-tab",
    );
    expect(
      shortcutFor(
        key("Tab", { metaKey: false, ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("prev-tab");
  });

  it("Cmd+Shift+H goes home", () => {
    expect(shortcutFor(key("h", { shiftKey: true }))).toBe("home");
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

  it("ignores keys that are not shortcuts", () => {
    expect(shortcutFor(key("q"))).toBeNull();
  });
});

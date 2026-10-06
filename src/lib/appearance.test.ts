import { describe, expect, it } from "vitest";
import {
  DEFAULT_READER,
  applyAppearance,
  parseReaderPrefs,
  parseTheme,
  resolveTheme,
  type RootLike,
} from "@/lib/appearance";

function fakeRoot() {
  const classes = new Set<string>();
  const root: RootLike = {
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    dataset: {},
  };
  return { root, classes };
}

describe("parseTheme", () => {
  it("accepts every theme and system, and defaults to system", () => {
    for (const t of [
      "light",
      "paper",
      "dark",
      "system",
      "catppuccin-mocha",
      "gruvbox-light",
    ]) {
      expect(parseTheme(t)).toBe(t);
    }
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
  });
});

describe("parseReaderPrefs", () => {
  it("returns defaults for missing or corrupt storage", () => {
    expect(parseReaderPrefs(null)).toEqual(DEFAULT_READER);
    expect(parseReaderPrefs("{not json")).toEqual(DEFAULT_READER);
    expect(parseReaderPrefs("42")).toEqual(DEFAULT_READER);
    expect(parseReaderPrefs("null")).toEqual(DEFAULT_READER);
  });

  it("keeps valid fields and replaces invalid ones individually", () => {
    const prefs = parseReaderPrefs(
      JSON.stringify({ font: "sans", size: "huge", measure: "wide" }),
    );
    expect(prefs).toEqual({ font: "sans", size: "m", measure: "wide" });
  });
});

describe("resolveTheme", () => {
  it("turns system into Yomu Light or Yomu Dark", () => {
    expect(resolveTheme("system", true).id).toBe("dark");
    expect(resolveTheme("system", false).id).toBe("light");
    expect(resolveTheme("one-dark", false)).toMatchObject({ mode: "dark" });
    expect(resolveTheme("catppuccin-latte", true)).toMatchObject({
      mode: "light",
    });
  });
});

describe("applyAppearance", () => {
  it("marks dark themes dark and names any theme that is not the default", () => {
    const { root, classes } = fakeRoot();
    applyAppearance(root, "paper", false, DEFAULT_READER);
    expect([...classes]).toEqual([]);
    expect(root.dataset.theme).toBe("paper");

    applyAppearance(root, "catppuccin-mocha", false, DEFAULT_READER);
    expect([...classes]).toEqual(["dark"]);
    expect(root.dataset.theme).toBe("catppuccin-mocha");

    applyAppearance(root, "dark", false, DEFAULT_READER);
    expect([...classes]).toEqual(["dark"]);
    expect(root.dataset.theme).toBeUndefined();

    applyAppearance(root, "system", false, DEFAULT_READER);
    expect([...classes]).toEqual([]);
    expect(root.dataset.theme).toBeUndefined();
  });

  it("writes non-default reader prefs as data attributes and clears defaults", () => {
    const { root } = fakeRoot();
    applyAppearance(root, "light", false, {
      font: "serif",
      size: "xl",
      measure: "narrow",
    });
    expect(root.dataset).toMatchObject({
      readerFont: "serif",
      readerSize: "xl",
      readerMeasure: "narrow",
    });
    applyAppearance(root, "light", false, DEFAULT_READER);
    expect(root.dataset.readerFont).toBeUndefined();
    expect(root.dataset.readerSize).toBeUndefined();
    expect(root.dataset.readerMeasure).toBeUndefined();
  });
});

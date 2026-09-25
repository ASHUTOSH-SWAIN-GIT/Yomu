import { describe, expect, it } from "vitest";
import {
  DEFAULT_READER,
  applyAppearance,
  parseReaderPrefs,
  parseTheme,
  themeClass,
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
  it("accepts the four themes and defaults to system", () => {
    for (const t of ["light", "paper", "dark", "system"]) {
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

describe("themeClass", () => {
  it("maps themes to the root class, following the OS for system", () => {
    expect(themeClass("light", true)).toBe("");
    expect(themeClass("paper", true)).toBe("paper");
    expect(themeClass("dark", false)).toBe("dark");
    expect(themeClass("system", true)).toBe("dark");
    expect(themeClass("system", false)).toBe("");
  });
});

describe("applyAppearance", () => {
  it("sets exactly one theme class", () => {
    const { root, classes } = fakeRoot();
    applyAppearance(root, "paper", false, DEFAULT_READER);
    expect([...classes]).toEqual(["paper"]);
    applyAppearance(root, "dark", false, DEFAULT_READER);
    expect([...classes]).toEqual(["dark"]);
    applyAppearance(root, "light", true, DEFAULT_READER);
    expect([...classes]).toEqual([]);
  });

  it("writes non-default reader prefs as data attributes and clears defaults", () => {
    const { root } = fakeRoot();
    applyAppearance(root, "light", false, {
      font: "sans",
      size: "xl",
      measure: "narrow",
    });
    expect(root.dataset).toMatchObject({
      readerFont: "sans",
      readerSize: "xl",
      readerMeasure: "narrow",
    });
    applyAppearance(root, "light", false, DEFAULT_READER);
    expect(root.dataset.readerFont).toBeUndefined();
    expect(root.dataset.readerSize).toBeUndefined();
    expect(root.dataset.readerMeasure).toBeUndefined();
  });
});

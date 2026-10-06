/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONTS } from "@/lib/fonts";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("reader fonts", () => {
  it("has unique ids", () => {
    const ids = FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every font except the default a stack in index.css", () => {
    for (const f of FONTS.filter((f) => f.id !== "sans")) {
      expect(css, f.label).toContain(`:root[data-reader-font="${f.id}"]`);
    }
  });

  it("names the family each downloaded font registers", () => {
    // Only the downloaded fonts register a family; the stack must use it.
    const families: Record<string, string> = {
      "source-sans": "Source Sans 3 Variable",
      atkinson: "Atkinson Hyperlegible Next Variable",
      "source-serif": "Source Serif 4 Variable",
      literata: "Literata Variable",
      lora: "Lora Variable",
      merriweather: "Merriweather Variable",
      newsreader: "Newsreader Variable",
    };
    for (const f of FONTS.filter((f) => "load" in f)) {
      expect(css, f.label).toContain(`"${families[f.id]}"`);
    }
  });
});

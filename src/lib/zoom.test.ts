import { describe, expect, it } from "vitest";
import { stepZoom } from "@/lib/zoom";

describe("stepZoom", () => {
  it("moves one step at a time", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });
  it("stops at the ends", () => {
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.67, -1)).toBe(0.67);
  });
  it("starts from 100% for an unknown level", () => {
    expect(stepZoom(1.33, 1)).toBe(1.1);
  });
});

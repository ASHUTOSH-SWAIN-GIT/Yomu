import { describe, expect, it } from "vitest";
import { stackShifts } from "@/lib/stack-layout";

describe("stackShifts", () => {
  it("leaves boxes alone when they have room", () => {
    expect(
      stackShifts(
        [
          { top: 0, height: 50 },
          { top: 100, height: 50 },
        ],
        8,
      ),
    ).toEqual([0, 0]);
  });

  it("pushes a box down past the one above it, with the gap", () => {
    expect(
      stackShifts(
        [
          { top: 0, height: 120 },
          { top: 40, height: 50 },
        ],
        8,
      ),
    ).toEqual([0, 88]);
  });

  it("carries the push down a chain, and lets a later box with room go back to its place", () => {
    expect(
      stackShifts(
        [
          { top: 0, height: 100 },
          { top: 10, height: 100 },
          { top: 20, height: 100 },
          { top: 500, height: 40 },
        ],
        10,
      ),
    ).toEqual([0, 100, 200, 0]);
  });

  it("touching boxes are separated by the gap", () => {
    expect(
      stackShifts(
        [
          { top: 0, height: 50 },
          { top: 50, height: 50 },
        ],
        8,
      ),
    ).toEqual([0, 8]);
  });

  it("handles no boxes", () => {
    expect(stackShifts([], 8)).toEqual([]);
  });
});

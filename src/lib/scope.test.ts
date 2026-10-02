import { describe, expect, it } from "vitest";
import {
  SUMMARY_LABEL,
  isThreadScope,
  parseScope,
  resolveScope,
} from "@/lib/scope";

describe("resolveScope", () => {
  it("trusts a stored scope", () => {
    expect(
      resolveScope({ scope: "library", content: "q", hasHighlight: false }),
    ).toBe("library");
    // Even when other fields would suggest something else.
    expect(
      resolveScope({ scope: "article", content: "q", hasHighlight: true }),
    ).toBe("article");
  });

  it("infers older rows the way the app used to read them", () => {
    expect(
      resolveScope({ scope: null, content: "passage", hasHighlight: true }),
    ).toBe("passage");
    expect(
      resolveScope({
        scope: null,
        content: SUMMARY_LABEL,
        hasHighlight: false,
      }),
    ).toBe("article");
    expect(
      resolveScope({ scope: null, content: "and then?", hasHighlight: false }),
    ).toBe("followup");
  });

  it("ignores a stored value it does not know", () => {
    expect(
      resolveScope({ scope: "bogus", content: "q", hasHighlight: false }),
    ).toBe("followup");
    expect(parseScope(undefined)).toBeNull();
  });
});

describe("isThreadScope", () => {
  it("sends article and library questions to the thread sheet only", () => {
    expect(isThreadScope("article")).toBe(true);
    expect(isThreadScope("library")).toBe(true);
    expect(isThreadScope("passage")).toBe(false);
    expect(isThreadScope("followup")).toBe(false);
    expect(isThreadScope(undefined)).toBe(false);
  });
});

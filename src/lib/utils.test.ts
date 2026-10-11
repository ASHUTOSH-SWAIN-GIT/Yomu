import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a named text size next to a text colour", () => {
    expect(cn("text-ui", "text-muted-foreground")).toBe(
      "text-ui text-muted-foreground",
    );
  });

  it("lets a later named size replace an earlier one", () => {
    expect(cn("text-ui", "text-meta")).toBe("text-meta");
  });
});

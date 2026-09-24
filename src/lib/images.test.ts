import { describe, expect, it } from "vitest";
import { isRemoteImage } from "@/lib/images";

describe("isRemoteImage", () => {
  it.each([
    ["https://cdn.example.com/a.png", true],
    ["http://example.com/a.png", true],
    ["//cdn.example.com/a.png", true],
    ["  HTTPS://EXAMPLE.COM/A.PNG", true],
    ["data:image/png;base64,AAAA", false],
    ["/static/a.png", false],
    ["a.png", false],
  ])("%s -> %s", (src, expected) => {
    expect(isRemoteImage(src)).toBe(expected);
  });
});

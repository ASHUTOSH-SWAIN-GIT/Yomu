import { describe, expect, it } from "vitest";
import { logoCandidates, parentHosts } from "@/lib/site-logo";

describe("parentHosts", () => {
  it("walks up from a subdomain to the registrable domain", () => {
    expect(parentHosts("ai-papers.aktagon.com")).toEqual(["aktagon.com"]);
    expect(parentHosts("a.b.example.com")).toEqual([
      "b.example.com",
      "example.com",
    ]);
  });

  it("has no parent for a bare domain, an IP or localhost", () => {
    expect(parentHosts("example.com")).toEqual([]);
    expect(parentHosts("127.0.0.1")).toEqual([]);
    expect(parentHosts("localhost")).toEqual([]);
  });

  it("does not stop at a two-part public suffix", () => {
    expect(parentHosts("blog.example.co.uk")).toEqual(["example.co.uk"]);
    expect(parentHosts("example.co.uk")).toEqual([]);
  });

  it("never offers a shared hosting platform's logo", () => {
    expect(parentHosts("someone.github.io")).toEqual([]);
    expect(parentHosts("app.someone.vercel.app")).toEqual([
      "someone.vercel.app",
    ]);
  });
});

describe("logoCandidates", () => {
  it("tries the declared icon, then the host, then its parents", () => {
    expect(
      logoCandidates("https://ai-papers.aktagon.com/papers/memgpt/", null),
    ).toEqual([
      "https://ai-papers.aktagon.com/apple-touch-icon.png",
      "https://ai-papers.aktagon.com/favicon.ico",
      "https://aktagon.com/apple-touch-icon.png",
      "https://aktagon.com/favicon.ico",
    ]);
    expect(
      logoCandidates(
        "https://example.com/post",
        "https://example.com/i.svg",
      )[0],
    ).toBe("https://example.com/i.svg");
  });

  it("returns nothing for a non-web address", () => {
    expect(logoCandidates("yomu://tour", null)).toEqual([]);
  });
});

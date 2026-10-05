import { describe, expect, it } from "vitest";
import { CHAT_ART_COUNT, chatArtFor } from "@/lib/chat-art";

describe("chatArtFor", () => {
  it("gives a blog the same picture every time", () => {
    expect(chatArtFor("0a37a76c-a4d0")).toBe(chatArtFor("0a37a76c-a4d0"));
  });

  it("always points at a picture that exists", () => {
    for (let i = 0; i < 500; i++) {
      const file = chatArtFor(crypto.randomUUID());
      const n = Number(/\/(\d+)\.svg$/.exec(file)?.[1]);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(CHAT_ART_COUNT);
    }
  });

  it("spreads different blogs across the pictures", () => {
    const used = new Set(
      Array.from({ length: 200 }, () => chatArtFor(crypto.randomUUID())),
    );
    expect(used.size).toBeGreaterThan(CHAT_ART_COUNT - 3);
  });
});

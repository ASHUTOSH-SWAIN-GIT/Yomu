import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  cacheImages: vi.fn(),
  imageCacheDir: vi.fn(),
  scrapeUrl: vi.fn(),
  canonicalizeUrl: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getArticleImages: vi.fn(),
  saveArticleImages: vi.fn(),
  getArticleByCanonicalUrl: vi.fn(),
  getArticleById: vi.fn(),
  upsertArticle: vi.fn(),
}));

import * as commands from "@/lib/commands";
import * as db from "@/lib/db";
import { useImageStore } from "@/stores/image-store";
import { useUiStore } from "@/stores/ui-store";
import { makeArticle } from "@/test/fixtures";
import type { Block } from "@/types/article";

const img = (src: string): Block => ({ type: "image", src, alt: null });
const article = makeArticle([
  img("https://cdn.x/a.png"),
  img("/rel.png"), // resolves against https://example.dev/post
  img("https://cdn.x/a.png"), // duplicate
  img("data:image/png;base64,AAAA"), // never downloaded
]);

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  useUiStore.setState({ blockRemoteImages: false });
  m(commands.imageCacheDir).mockResolvedValue("/data/images");
  m(db.getArticleImages).mockResolvedValue({});
  m(db.saveArticleImages).mockResolvedValue(undefined);
  await useImageStore.getState().sync(null);
});

describe("image store sync", () => {
  it("downloads each unique http(s) image once and records the files", async () => {
    m(commands.cacheImages).mockResolvedValue(["aaa.png", "bbb.png"]);
    await useImageStore.getState().sync(article);

    expect(m(commands.cacheImages).mock.calls[0][0]).toEqual([
      "https://cdn.x/a.png",
      "https://example.dev/rel.png",
    ]);
    expect(db.saveArticleImages).toHaveBeenCalledWith("a1", [
      { url: "https://cdn.x/a.png", file: "aaa.png" },
      { url: "https://example.dev/rel.png", file: "bbb.png" },
    ]);
    const s = useImageStore.getState();
    expect(s.dir).toBe("/data/images");
    expect(s.files["https://cdn.x/a.png"]).toBe("aaa.png");
    expect(s.loaded).toBe(true);
  });

  it("only downloads what is not already cached", async () => {
    m(db.getArticleImages).mockResolvedValue({
      "https://cdn.x/a.png": "aaa.png",
    });
    m(commands.cacheImages).mockResolvedValue(["bbb.png"]);
    await useImageStore.getState().sync(article);
    expect(m(commands.cacheImages).mock.calls[0][0]).toEqual([
      "https://example.dev/rel.png",
    ]);
  });

  it("does not download when everything is cached", async () => {
    m(db.getArticleImages).mockResolvedValue({
      "https://cdn.x/a.png": "a.png",
      "https://example.dev/rel.png": "b.png",
    });
    await useImageStore.getState().sync(article);
    expect(commands.cacheImages).not.toHaveBeenCalled();
    expect(useImageStore.getState().loaded).toBe(true);
  });

  it("does not fetch anything itself when remote images are blocked", async () => {
    useUiStore.setState({ blockRemoteImages: true });
    m(db.getArticleImages).mockResolvedValue({
      "https://cdn.x/a.png": "aaa.png",
    });
    await useImageStore.getState().sync(article);
    expect(commands.cacheImages).not.toHaveBeenCalled();
    // Already cached images are still available (they're local).
    expect(useImageStore.getState().files["https://cdn.x/a.png"]).toBe(
      "aaa.png",
    );
  });

  it("keeps the images that did download when some fail", async () => {
    m(commands.cacheImages).mockResolvedValue([null, "bbb.png"]);
    await useImageStore.getState().sync(article);
    expect(db.saveArticleImages).toHaveBeenCalledWith("a1", [
      { url: "https://example.dev/rel.png", file: "bbb.png" },
    ]);
  });

  it("stays not-loaded until the index is read, then loaded", async () => {
    let release!: (v: Record<string, string>) => void;
    m(db.getArticleImages).mockReturnValue(new Promise((r) => (release = r)));
    m(commands.cacheImages).mockResolvedValue([]);
    const pending = useImageStore.getState().sync(article);
    expect(useImageStore.getState().loaded).toBe(false);
    release({});
    await pending;
    expect(useImageStore.getState().loaded).toBe(true);
  });

  it("falls back to loaded (remote images) when caching blows up", async () => {
    m(db.getArticleImages).mockRejectedValue(new Error("db down"));
    await useImageStore.getState().sync(article);
    expect(useImageStore.getState().loaded).toBe(true);
  });

  it("ignores results for an article the user has already left", async () => {
    let finish!: (v: (string | null)[]) => void;
    m(commands.cacheImages).mockReturnValue(new Promise((r) => (finish = r)));
    const first = useImageStore.getState().sync(article);
    await vi.waitFor(() => expect(commands.cacheImages).toHaveBeenCalled());
    await useImageStore.getState().sync(makeArticle([], { id: "a2" })); // switch away
    finish(["aaa.png", "bbb.png"]);
    await first;
    expect(db.saveArticleImages).not.toHaveBeenCalled();
    expect(useImageStore.getState().articleId).toBe("a2");
  });
});

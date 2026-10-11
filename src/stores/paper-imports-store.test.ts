import { beforeEach, describe, expect, it, vi } from "vitest";

const addPaper = vi.fn();
vi.mock("@/lib/pdf/add", () => ({
  addPaper: (...a: unknown[]) => addPaper(...a),
}));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const { usePaperImports } = await import("@/stores/paper-imports-store");

const settle = () => new Promise((r) => setTimeout(r, 0));
const statuses = () =>
  usePaperImports.getState().items.map((i) => [i.name, i.status]);

describe("adding several papers", () => {
  beforeEach(() => {
    addPaper.mockReset();
    usePaperImports.setState({ items: [] });
  });

  it("reads them one at a time, in order, and says how each went", async () => {
    const order: string[] = [];
    addPaper.mockImplementation(async (path: string) => {
      order.push(path);
      if (path.endsWith("scan.pdf")) throw new Error("no selectable text");
      return { article: {}, added: !path.endsWith("old.pdf") };
    });
    usePaperImports.getState().add(["/a/new.pdf", "/a/old.pdf", "/a/scan.pdf"]);
    expect(statuses()[0][1]).toBe("reading");
    await settle();
    await settle();
    await settle();
    expect(order).toEqual(["/a/new.pdf", "/a/old.pdf", "/a/scan.pdf"]);
    expect(statuses()).toEqual([
      ["new.pdf", "added"],
      ["old.pdf", "already"],
      ["scan.pdf", "failed"],
    ]);
  });

  it("clears the finished ones and keeps the rest", async () => {
    let finish: () => void = () => {};
    addPaper
      .mockResolvedValueOnce({ article: {}, added: true })
      .mockImplementationOnce(
        () =>
          new Promise((r) => (finish = () => r({ article: {}, added: true }))),
      );
    usePaperImports.getState().add(["/a/one.pdf", "/a/two.pdf"]);
    await settle();
    usePaperImports.getState().clearDone();
    expect(statuses()).toEqual([["two.pdf", "reading"]]);
    finish();
    await settle();
    expect(statuses()).toEqual([["two.pdf", "added"]]);
  });
});

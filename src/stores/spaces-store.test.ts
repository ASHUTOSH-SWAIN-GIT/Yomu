import { beforeEach, describe, expect, it, vi } from "vitest";

function stubStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => void (data[k] = v),
    },
  });
  return data;
}
async function freshStore() {
  vi.resetModules();
  return (await import("@/stores/spaces-store")).useSpacesStore;
}
beforeEach(() => vi.unstubAllGlobals());

describe("spaces-store", () => {
  it("defaults to the inbox", async () => {
    stubStorage();
    expect((await freshStore()).getState().active).toBe("inbox");
  });

  it("creates a normalised space, makes it active, and gives it a colour", async () => {
    const data = stubStorage();
    const store = await freshStore();
    const id = store.getState().createSpace("  Reading List ");
    expect(id).toBe("reading-list");
    expect(store.getState().active).toBe("reading-list");
    expect(store.getState().extra).toEqual(["reading-list"]);
    expect(store.getState().slots["reading-list"]).toBe(0);
    expect(JSON.parse(data["yomu-spaces-extra"])).toEqual(["reading-list"]);
  });

  it("rejects empty names and the reserved inbox name", async () => {
    stubStorage();
    const store = await freshStore();
    expect(store.getState().createSpace("   ")).toBeNull();
    expect(store.getState().createSpace("Inbox")).toBeNull();
    expect(store.getState().extra).toEqual([]);
  });

  it("keeps colours stable across syncs and restarts", async () => {
    const data = stubStorage();
    const store = await freshStore();
    store.getState().syncSlots(["rust", "web"]);
    store.getState().syncSlots(["web", "ai", "rust"]);
    const { slots } = store.getState();
    expect(slots.rust).toBe(0);
    expect(slots.web).toBe(1);
    expect(slots.ai).toBe(2);

    stubStorage(data);
    const again = await freshStore();
    expect(again.getState().slots).toEqual(slots);
  });

  it("survives corrupt stored data", async () => {
    stubStorage({ "yomu-space-slots": "{bad", "yomu-spaces-extra": '{"a":1}' });
    const store = await freshStore();
    expect(store.getState().slots).toEqual({});
    expect(store.getState().extra).toEqual([]);
  });

  it("shows one page at a time: settings, the chat or a list", async () => {
    stubStorage();
    const store = await freshStore();
    store.getState().setSettingsPage(true);
    expect(store.getState().settingsPage).toBe(true);
    store.getState().setLibraryChat(true);
    expect(store.getState().settingsPage).toBe(false);
    store.getState().setSettingsPage(true);
    expect(store.getState().libraryChat).toBe(false);
    store.getState().setShowArchive(true);
    expect(store.getState().settingsPage).toBe(false);
    store.getState().setSettingsPage(true);
    store.getState().setActive("inbox");
    expect(store.getState().settingsPage).toBe(false);
  });

  it("forgets every collection and colour on reset", async () => {
    const data = stubStorage();
    const store = await freshStore();
    store.getState().createSpace("rust");
    store.getState().reset();
    expect(store.getState().extra).toEqual([]);
    expect(store.getState().slots).toEqual({});
    expect(JSON.parse(data["yomu-spaces-extra"])).toEqual([]);
    expect(store.getState().active).toBe("inbox");
  });
});

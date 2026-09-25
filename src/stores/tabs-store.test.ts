import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  opened: [] as string[],
  resets: 0,
  streaming: false,
  stopped: 0,
  removed: [] as string[],
  readerListeners: [] as ((s: unknown, p: unknown) => void)[],
}));

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/stores/reader-store", () => ({
  useReaderStore: {
    getState: () => ({
      openArticle: async (id: string) => void h.opened.push(id),
      reset: () => void (h.resets += 1),
    }),
    subscribe: (fn: (s: unknown, p: unknown) => void) =>
      void h.readerListeners.push(fn),
  },
}));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      streaming: h.streaming,
      stop: async () => {
        h.stopped += 1;
        h.streaming = false;
      },
    }),
  },
}));
vi.mock("@/stores/library-store", () => ({
  useLibraryStore: {
    getState: () => ({ remove: async (id: string) => void h.removed.push(id) }),
  },
}));

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
  return (await import("@/stores/tabs-store")).useTabsStore;
}

const lastOpened = () => h.opened[h.opened.length - 1];

beforeEach(() => {
  vi.unstubAllGlobals();
  h.opened = [];
  h.resets = 0;
  h.streaming = false;
  h.stopped = 0;
  h.removed = [];
  h.readerListeners = [];
});

describe("opening articles", () => {
  it("starts with one empty tab and fills it with the first article", async () => {
    stubStorage();
    const store = await freshStore();
    expect(store.getState().tabs).toHaveLength(1);
    await store.getState().openArticle("a1");
    expect(store.getState().tabs.map((t) => t.articleId)).toEqual(["a1"]);
    expect(h.opened).toEqual(["a1"]);
  });

  it("opens further articles in new tabs and focuses an already open one", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("a2");
    expect(store.getState().tabs.map((t) => t.articleId)).toEqual(["a1", "a2"]);
    const activeBefore = store.getState().activeId;
    await store.getState().openArticle("a1"); // already open: focus, no new tab
    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().activeId).not.toBe(activeBefore);
    expect(lastOpened()).toBe("a1");
  });

  it("a new tab is empty and shows the welcome page", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().newTab();
    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().tabs[1].articleId).toBeNull();
    expect(h.resets).toBe(1);
  });
});

describe("closing tabs", () => {
  it("closing the active tab activates its neighbour", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("a2");
    await store.getState().openArticle("a3");
    const [t1, t2, t3] = store.getState().tabs;
    await store.getState().activate(t2.id);
    await store.getState().close(t2.id);
    expect(store.getState().tabs.map((t) => t.id)).toEqual([t1.id, t3.id]);
    expect(store.getState().activeId).toBe(t3.id);
    expect(lastOpened()).toBe("a3");
  });

  it("closing an inactive tab does not navigate", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("a2");
    const opened = h.opened.length;
    await store.getState().close(store.getState().tabs[0].id);
    expect(h.opened).toHaveLength(opened);
  });

  it("closing the last tab leaves one empty tab", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().close(store.getState().tabs[0].id);
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().tabs[0].articleId).toBeNull();
    expect(h.resets).toBe(1);
  });
});

describe("switching while an answer streams", () => {
  it("stops the answer (keeping its text) before switching", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("a2");
    h.streaming = true;
    await store.getState().activate(store.getState().tabs[0].id);
    expect(h.stopped).toBe(1);
    expect(lastOpened()).toBe("a1");
  });
});

describe("persistence", () => {
  it("saves tabs and restores them, dropping deleted articles", async () => {
    const data = stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("gone");
    expect(JSON.parse(data["yomu-tabs"]).tabs).toHaveLength(2);

    const again = await freshStore();
    await again.getState().restore(new Set(["a1"]));
    expect(again.getState().tabs.map((t) => t.articleId)).toEqual(["a1"]);
    expect(lastOpened()).toBe("a1");
  });

  it("ignores corrupt storage", async () => {
    stubStorage({ "yomu-tabs": "{nope" });
    const store = await freshStore();
    await store.getState().restore(new Set());
    expect(store.getState().tabs).toHaveLength(1);
  });
});

describe("deleting an article", () => {
  it("removes it from the library and closes its tab", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().openArticle("a2");
    await store.getState().deleteArticle("a1");
    expect(h.removed).toEqual(["a1"]);
    expect(store.getState().tabs.map((t) => t.articleId)).toEqual(["a2"]);
  });
});

describe("following the reader", () => {
  it("puts an article opened from a URL into the active tab", async () => {
    stubStorage();
    const store = await freshStore();
    const notify = h.readerListeners[0];
    notify(
      { state: { status: "ready", article: { id: "url1" } } },
      { state: { status: "empty" } },
    );
    expect(store.getState().tabs[0].articleId).toBe("url1");
  });

  it("keeps one tab per article", async () => {
    stubStorage();
    const store = await freshStore();
    await store.getState().openArticle("a1");
    await store.getState().newTab();
    const notify = h.readerListeners[0];
    notify(
      { state: { status: "ready", article: { id: "a1" } } },
      { state: { status: "empty" } },
    );
    expect(
      store.getState().tabs.filter((t) => t.articleId === "a1"),
    ).toHaveLength(1);
  });
});

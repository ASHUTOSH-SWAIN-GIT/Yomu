import { beforeEach, describe, expect, it, vi } from "vitest";

function stubStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    },
  });
  return data;
}

async function freshStore() {
  vi.resetModules();
  return (await import("@/stores/ui-store")).useUiStore;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("ui-store persistence", () => {
  it("restores saved theme and reader prefs on load", async () => {
    stubStorage({
      "yomu-theme": "paper",
      "yomu-reader": JSON.stringify({ font: "serif" }),
    });
    const s = (await freshStore()).getState();
    expect(s.theme).toBe("paper");
    expect(s.reader).toEqual({ font: "serif" });
  });

  it("saves changes, merging partial reader updates", async () => {
    const data = stubStorage();
    const store = await freshStore();
    store.getState().setTheme("dark");
    store.getState().setReader({ font: "serif" });
    expect(data["yomu-theme"]).toBe("dark");
    expect(JSON.parse(data["yomu-reader"])).toEqual({ font: "serif" });
  });

  it("still works when storage is unavailable", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    const store = await freshStore();
    expect(store.getState().theme).toBe("system");
    store.getState().setTheme("paper");
    store.getState().setReader({ font: "serif" });
    expect(store.getState().theme).toBe("paper");
    expect(store.getState().reader.font).toBe("serif");
  });

  it("starts with focus mode off", async () => {
    stubStorage();
    const store = await freshStore();
    expect(store.getState().focusMode).toBe(false);
    store.getState().setFocusMode(true);
    expect(store.getState().focusMode).toBe(true);
  });

  it("restores and saves explain preferences, merging partial updates", async () => {
    const data = stubStorage({
      "yomu-explain-prefs": JSON.stringify({
        level: "expert",
        codeExamples: "never",
      }),
    });
    const store = await freshStore();
    expect(store.getState().explainPrefs).toEqual({
      level: "expert",
      codeExamples: "never",
      style: "",
    });

    store.getState().setExplainPrefs({ level: "beginner" });
    expect(store.getState().explainPrefs).toEqual({
      level: "beginner",
      codeExamples: "never",
      style: "",
    });
    expect(JSON.parse(data["yomu-explain-prefs"])).toEqual({
      level: "beginner",
      codeExamples: "never",
      style: "",
    });
  });

  it("defaults explain preferences to balanced/helpful with no storage", async () => {
    stubStorage();
    const store = await freshStore();
    expect(store.getState().explainPrefs).toEqual({
      level: "balanced",
      codeExamples: "helpful",
      style: "",
    });
  });
});

import { create } from "zustand";
import { logError } from "@/lib/log";
import { readStorage, writeStorage } from "@/lib/storage";
import { useChatStore } from "@/stores/chat-store";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";

/** A tab shows one article, or nothing yet (a "new tab" with the welcome page). */
export interface Tab {
  id: string;
  articleId: string | null;
}

const KEY = "yomu-tabs";

interface TabsStore {
  tabs: Tab[];
  activeId: string;
  newTab: () => Promise<void>;
  /** Shows the library: an existing empty tab if there is one, else a new one. */
  goHome: () => Promise<void>;
  /** Opens an article: focuses its tab if open, else uses an empty tab, else a new one. */
  openArticle: (articleId: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  close: (id: string) => Promise<void>;
  /** Restores tabs from the last session, dropping articles that no longer exist. */
  restore: (existingArticleIds: Set<string>) => Promise<void>;
  /** Deletes an article and closes any tab that showed it. */
  deleteArticle: (articleId: string) => Promise<void>;
}

const uid = () => crypto.randomUUID();
const makeTab = (articleId: string | null = null): Tab => ({
  id: uid(),
  articleId,
});

function save(tabs: Tab[], activeId: string) {
  writeStorage(KEY, JSON.stringify({ tabs, activeId }));
}

/** Switching articles while an answer streams would drop the rest of it, so
 * stop the answer first (its partial text is kept) and wait for it to end. */
async function settleStreaming() {
  if (!useChatStore.getState().streaming) return;
  await useChatStore.getState().stop();
  const deadline = Date.now() + 3000;
  while (useChatStore.getState().streaming && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function show(tab: Tab) {
  await settleStreaming();
  if (tab.articleId) await useReaderStore.getState().openArticle(tab.articleId);
  else useReaderStore.getState().reset();
}

const first = makeTab();

export const useTabsStore = create<TabsStore>((set, get) => {
  const update = (tabs: Tab[], activeId: string) => {
    save(tabs, activeId);
    set({ tabs, activeId });
  };

  return {
    tabs: [first],
    activeId: first.id,

    async newTab() {
      const tab = makeTab();
      update([...get().tabs, tab], tab.id);
      await show(tab);
    },

    async goHome() {
      const empty = get().tabs.find((t) => t.articleId === null);
      if (empty) return get().activate(empty.id);
      await get().newTab();
    },

    async openArticle(articleId) {
      const { tabs, activeId } = get();
      const existing = tabs.find((t) => t.articleId === articleId);
      if (existing) return get().activate(existing.id);

      const active = tabs.find((t) => t.id === activeId);
      if (active && active.articleId === null) {
        const next = tabs.map((t) =>
          t.id === active.id ? { ...t, articleId } : t,
        );
        update(next, active.id);
        return show({ ...active, articleId });
      }
      const tab = makeTab(articleId);
      update([...tabs, tab], tab.id);
      await show(tab);
    },

    async activate(id) {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      if (id === get().activeId) return;
      update(get().tabs, id);
      await show(tab);
    },

    async close(id) {
      const { tabs, activeId } = get();
      const index = tabs.findIndex((t) => t.id === id);
      if (index < 0) return;
      const remaining = tabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        // There is always a tab: closing the last one leaves an empty one.
        const tab = makeTab();
        update([tab], tab.id);
        return show(tab);
      }
      if (id !== activeId) {
        update(remaining, activeId);
        return;
      }
      const next = remaining[index] ?? remaining[index - 1];
      update(remaining, next.id);
      await show(next);
    },

    async restore(existing) {
      try {
        const saved = JSON.parse(readStorage(KEY) ?? "null") as {
          tabs?: Tab[];
          activeId?: string;
        } | null;
        const tabs = (saved?.tabs ?? []).filter(
          (t) =>
            typeof t?.id === "string" &&
            (t.articleId === null || existing.has(t.articleId)),
        );
        if (tabs.length === 0) return;
        const active = tabs.find((t) => t.id === saved?.activeId) ?? tabs[0];
        set({ tabs, activeId: active.id });
        await show(active);
      } catch (err) {
        logError("restoring tabs failed", err);
      }
    },

    async deleteArticle(articleId) {
      const tab = get().tabs.find((t) => t.articleId === articleId);
      await useLibraryStore.getState().remove(articleId);
      if (tab) await get().close(tab.id);
    },
  };
});

// A URL opened from the welcome page (or a re-scrape) lands in the active
// tab: keep the tab in step with what the reader shows.
useReaderStore.subscribe((state, prev) => {
  if (state.state.status !== "ready") return;
  const article = state.state.article;
  const before = prev.state.status === "ready" ? prev.state.article : null;
  if (before?.id === article.id) return;

  const { tabs, activeId } = useTabsStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active || active.articleId === article.id) return;
  // Another tab already shows it: keep one tab per article.
  const next = tabs
    .filter((t) => t.id === activeId || t.articleId !== article.id)
    .map((t) => (t.id === activeId ? { ...t, articleId: article.id } : t));
  save(next, activeId);
  useTabsStore.setState({ tabs: next });
});

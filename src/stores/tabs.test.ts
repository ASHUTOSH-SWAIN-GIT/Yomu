import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/types/agent";

const h = vi.hoisted(() => ({
  handlers: [] as ((e: AgentEvent) => void)[],
  unlistened: 0,
}));
const emit = (e: AgentEvent) => h.handlers.forEach((fn) => fn(e));

vi.mock("@/lib/agent-events", () => ({
  onAgentEvent: (fn: (e: AgentEvent) => void) => {
    h.handlers.push(fn);
    return Promise.resolve(() => {
      h.unlistened += 1;
      h.handlers.splice(h.handlers.indexOf(fn), 1);
    });
  },
}));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  agentNewSession: vi.fn(),
  agentResumeSession: vi.fn(),
  agentPrompt: vi.fn(),
  agentCancel: vi.fn(),
  agentDiagnose: vi.fn(),
  agentLogin: vi.fn(),
  agentWarm: vi.fn(),
  scrapeUrl: vi.fn(),
  canonicalizeUrl: vi.fn(),
  cacheImages: vi.fn(),
  cachedImageNames: vi.fn(),
  imageCacheDir: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  addHighlight: vi.fn(),
  addMessage: vi.fn(),
  createChat: vi.fn(),
  deleteLastAssistantMessage: vi.fn(),
  deleteLastUserMessage: vi.fn(),
  getChatForArticle: vi.fn(),
  listHighlights: vi.fn(),
  listMessages: vi.fn(),
  libraryPassages: vi.fn(),
  relatedArticles: vi.fn(),
  setChatSession: vi.fn(),
  getArticleById: vi.fn(),
  getArticleByCanonicalUrl: vi.fn(),
  upsertArticle: vi.fn(),
  getArticleImages: vi.fn(),
  saveArticleImages: vi.fn(),
  listLibraryChats: vi.fn(),
  listLibraryMessages: vi.fn(),
  createLibraryChat: vi.fn(),
  addLibraryMessage: vi.fn(),
  deleteLibraryChat: vi.fn(),
  inventoryPassages: vi.fn(),
}));

import * as commands from "@/lib/commands";
import * as db from "@/lib/db";
import { useChatStore } from "@/stores/chat-store";
import "@/stores/library-chat-store";
import { useReaderStore } from "@/stores/reader-store";
import {
  activateTab,
  activeBundle,
  closeTab,
  openTab,
  partOf,
  resetTabs,
  switchTab,
  useTabsStore,
} from "@/stores/tabs";
import { useViewStore } from "@/stores/view-store";
import { makeArticle, p } from "@/test/fixtures";

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const article = makeArticle([p("abc")]);
const other = { ...makeArticle([]), id: "a2", title: "Other" };

beforeEach(() => {
  vi.clearAllMocks();
  resetTabs();
  m(db.getChatForArticle).mockResolvedValue(null);
  m(db.listHighlights).mockResolvedValue([]);
  m(db.listMessages).mockResolvedValue([]);
  m(db.listLibraryChats).mockResolvedValue([]);
  m(db.getArticleById).mockImplementation(async (id: string) =>
    id === "a2" ? other : article,
  );
  m(commands.agentCancel).mockResolvedValue(undefined);
});

describe("tabs", () => {
  it("starts with one tab, and a new tab becomes the active one", () => {
    expect(useTabsStore.getState().ids).toHaveLength(1);
    const first = useTabsStore.getState().activeId;
    const second = openTab();
    expect(useTabsStore.getState().ids).toEqual([first, second.id]);
    expect(useTabsStore.getState().activeId).toBe(second.id);
  });

  it("keeps what each tab shows apart", async () => {
    const first = activeBundle();
    await useReaderStore.getState().openArticle("a1");
    useViewStore.getState().setChatOpen(true);

    const second = openTab();
    // The new tab starts empty, and the facade now points at it.
    expect(useReaderStore.getState().state.status).toBe("empty");
    expect(useViewStore.getState().chatOpen).toBe(false);
    await useReaderStore.getState().openArticle("a2");

    const read = (b: typeof first) => partOf(b, "reader").getState().state;
    expect(read(first)).toMatchObject({ article: { id: article.id } });
    expect(read(second)).toMatchObject({ article: { id: "a2" } });
    expect(partOf(first, "view").getState().chatOpen).toBe(true);
  });

  it("streams an answer in one tab while another tab is active", async () => {
    const first = activeBundle();
    m(db.createChat).mockResolvedValue({
      id: "c1",
      articleId: "a1",
      acpSessionId: null,
    });
    m(db.addHighlight).mockResolvedValue({
      id: "h1",
      articleId: "a1",
      blockIndex: 0,
      startOffset: 0,
      endOffset: 3,
      text: "abc",
    });
    m(commands.agentNewSession).mockResolvedValue("s1");
    // The agent only answers when told to, so the tab switch happens first.
    let release: () => void = () => {};
    m(commands.agentPrompt).mockImplementation(
      () => new Promise<void>((r) => (release = r)),
    );
    await partOf(first, "reader").getState().openArticle("a1");
    const asking = partOf(first, "chat").getState().explain(article, {
      blockIndex: 0,
      startOffset: 0,
      endOffset: 3,
      text: "abc",
    });
    await vi.waitFor(() =>
      expect(commands.agentPrompt).toHaveBeenCalledTimes(1),
    );
    openTab(); // leave the first tab while its answer is in flight

    emit({ kind: "token", session_id: "s1", text: "Hello " });
    emit({ kind: "token", session_id: "s1", text: "there" });
    emit({ kind: "done", session_id: "s1" });
    release();
    await asking;

    const firstChat = partOf(first, "chat").getState();
    expect(firstChat.messages[firstChat.messages.length - 1]).toMatchObject({
      role: "assistant",
      text: "Hello there",
    });
    expect(firstChat.streaming).toBe(false);
    // The tab on screen heard nothing.
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("closing the active tab moves to its neighbour and lets go of it", async () => {
    const first = activeBundle().id;
    const second = openTab().id;
    const third = openTab().id;
    activateTab(second);
    const before = h.unlistened;
    closeTab(second);
    expect(useTabsStore.getState().ids).toEqual([first, third]);
    expect(useTabsStore.getState().activeId).toBe(third);
    // The closed tab stopped listening to the agent (it unlistens async).
    await Promise.resolve();
    expect(h.unlistened).toBeGreaterThan(before);
  });

  it("closing the last tab leaves one empty tab", async () => {
    await useReaderStore.getState().openArticle("a1");
    const only = useTabsStore.getState().activeId;
    closeTab(only);
    expect(useTabsStore.getState().ids).toHaveLength(1);
    expect(useTabsStore.getState().activeId).not.toBe(only);
    expect(useReaderStore.getState().state.status).toBe("empty");
  });

  it("switches to the next and previous tab, wrapping round", () => {
    const first = activeBundle().id;
    const second = openTab().id;
    switchTab(1);
    expect(useTabsStore.getState().activeId).toBe(first);
    switchTab(-1);
    expect(useTabsStore.getState().activeId).toBe(second);
  });
});

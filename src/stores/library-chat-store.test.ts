import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/types/agent";

const h = vi.hoisted(() => ({
  handlers: [] as ((e: AgentEvent) => void)[],
  chats: [] as { id: string; title: string; updatedAt: number }[],
  messages: new Map<string, { role: "user" | "assistant"; text: string }[]>(),
  prompts: [] as string[],
  sessions: 0,
}));
const emit = (e: AgentEvent) => h.handlers.forEach((fn) => fn(e));

vi.mock("@/lib/agent-events", () => ({
  onAgentEvent: (fn: (e: AgentEvent) => void) => {
    h.handlers.push(fn);
    return Promise.resolve(() => {});
  },
}));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/models", () => ({ applyChosenModel: vi.fn() }));
vi.mock("@/lib/commands", () => ({
  agentNewSession: async () => `s${++h.sessions}`,
  agentCancel: async () => {},
  agentPrompt: async (_session: string, text: string) => {
    h.prompts.push(text);
  },
}));
vi.mock("@/lib/db", () => ({
  inventoryPassages: async () => [],
  createLibraryChat: async (title: string) => {
    const id = `chat${h.chats.length + 1}`;
    h.chats.unshift({ id, title, updatedAt: 1 });
    h.messages.set(id, []);
    return id;
  },
  addLibraryMessage: async (
    id: string,
    role: "user" | "assistant",
    text: string,
  ) => {
    h.messages.get(id)?.push({ role, text });
  },
  listLibraryChats: async () => [...h.chats],
  listLibraryMessages: async (id: string) => [...(h.messages.get(id) ?? [])],
  deleteLibraryChat: async (id: string) => {
    h.chats = h.chats.filter((c) => c.id !== id);
    h.messages.delete(id);
  },
}));

import { useLibraryChatStore } from "@/stores/library-chat-store";

const store = () => useLibraryChatStore.getState();

/** Lets the chat answer, the way the agent's events would. */
async function answer(text: string) {
  const session = store().sessionId!;
  emit({ kind: "token", session_id: session, text });
  emit({ kind: "done", session_id: session });
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  h.chats = [];
  h.messages = new Map();
  h.prompts = [];
  await store().reset();
});

describe("saved library chats", () => {
  it("saves the first question as a chat named after it, and both sides of it", async () => {
    await store().ask("What have I saved about databases?");
    await answer("Two articles.");
    expect(h.chats.map((c) => c.title)).toEqual([
      "What have I saved about databases?",
    ]);
    expect(h.messages.get("chat1")).toEqual([
      { role: "user", text: "What have I saved about databases?" },
      { role: "assistant", text: "Two articles." },
    ]);
    expect(store().chats).toHaveLength(1);
  });

  it("keeps adding to the same chat, and starts another after a reset", async () => {
    await store().ask("first");
    await answer("one");
    await store().ask("second");
    await answer("two");
    expect(h.chats).toHaveLength(1);
    expect(h.messages.get("chat1")).toHaveLength(4);

    await store().reset();
    await store().ask("a new topic");
    expect(h.chats).toHaveLength(2);
  });

  it("reopens a saved chat, and tells the new session what was said", async () => {
    await store().ask("first question");
    await answer("first answer");
    await store().reset();

    await store().openChat("chat1");
    expect(store().messages.map((m) => m.text)).toEqual([
      "first question",
      "first answer",
    ]);
    await store().ask("a follow up");
    const prompt = h.prompts[h.prompts.length - 1];
    expect(prompt).toContain("The conversation so far:");
    expect(prompt).toContain("Reader: first question");
    expect(prompt).toContain("You: first answer");
    // The follow up is the message being asked, not part of the history.
    expect(prompt).not.toContain("Reader: a follow up");
    expect(prompt).toContain("Message: a follow up");
  });

  it("does not repeat the history while the session still remembers it", async () => {
    await store().ask("one");
    await answer("1");
    await store().ask("two");
    expect(h.prompts[1]).not.toContain("The conversation so far:");
  });

  it("moves to a fresh session, telling it what was said, when the memory is nearly full", async () => {
    await store().ask("one");
    emit({
      kind: "usage",
      session_id: store().sessionId!,
      used: 90,
      size: 100,
    });
    await answer("1");
    expect(store().context).toEqual({ used: 90, size: 100 });
    const before = h.sessions;

    await store().ask("two");
    expect(h.sessions).toBe(before + 1);
    expect(h.prompts[1]).toContain("The conversation so far:");
    // The new session starts with an empty memory.
    expect(store().context).toBeNull();
  });

  it("stays in the same session while there is room", async () => {
    await store().ask("one");
    emit({
      kind: "usage",
      session_id: store().sessionId!,
      used: 40,
      size: 100,
    });
    await answer("1");
    const before = h.sessions;
    await store().ask("two");
    expect(h.sessions).toBe(before);
  });

  it("deletes a chat, and leaves the screen when it was the open one", async () => {
    await store().ask("to delete");
    await answer("ok");
    await store().deleteChat("chat1");
    expect(h.chats).toHaveLength(0);
    expect(store().chatId).toBeNull();
    expect(store().messages).toEqual([]);
    expect(store().chats).toEqual([]);
  });

  it("keeps the chat in progress out of the previous chats until you move on", async () => {
    await store().ask("a live question");
    await answer("ok");
    // It is saved, but still the live one, so the sidebar leaves it out.
    expect(store().chatId).toBe("chat1");
    expect(store().liveChatId).toBe("chat1");

    // Starting a new chat moves it into the list.
    await store().reset();
    expect(store().liveChatId).toBeNull();
    expect(store().chats.map((c) => c.id)).toContain("chat1");

    // Opening a saved one is not "live" either.
    await store().openChat("chat1");
    expect(store().liveChatId).toBeNull();
  });
});

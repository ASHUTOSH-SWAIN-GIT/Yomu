import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/types/agent";

const h = vi.hoisted(() => ({
  handlers: [] as ((e: AgentEvent) => void)[],
}));
const emit = (e: AgentEvent) => h.handlers.forEach((fn) => fn(e));

vi.mock("@/lib/agent-events", () => ({
  onAgentEvent: (fn: (e: AgentEvent) => void) => {
    h.handlers.push(fn);
    return Promise.resolve(() => {});
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
}));
vi.mock("@/lib/db", () => ({
  addHighlight: vi.fn(),
  addMessage: vi.fn(),
  createChat: vi.fn(),
  deleteLastAssistantMessage: vi.fn(),
  getChatForArticle: vi.fn(),
  listHighlights: vi.fn(),
  listMessages: vi.fn(),
  setChatSession: vi.fn(),
}));

import * as commands from "@/lib/commands";
import * as db from "@/lib/db";
import { useChatStore } from "@/stores/chat-store";
import { makeArticle, p } from "@/test/fixtures";

const article = makeArticle([
  p("Each value has one owner."),
  p("Second paragraph."),
]);
const selection = {
  blockIndex: 0,
  startOffset: 0,
  endOffset: 9,
  text: "Each value",
};
const highlight = { id: "h1", articleId: "a1", ...selection };

const last = <T>(items: T[]): T | undefined => items[items.length - 1];

const m = <T extends (...a: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

/** Makes the agent stream `text` in two chunks, then finish. */
function agentReplies(text: string) {
  m(commands.agentPrompt).mockImplementation(async (sessionId: string) => {
    const mid = Math.ceil(text.length / 2);
    emit({ kind: "token", session_id: sessionId, text: text.slice(0, mid) });
    emit({ kind: "token", session_id: sessionId, text: text.slice(mid) });
    emit({ kind: "done", session_id: sessionId });
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  m(db.createChat).mockResolvedValue({
    id: "c1",
    articleId: "a1",
    acpSessionId: null,
  });
  m(db.addHighlight).mockResolvedValue(highlight);
  m(db.getChatForArticle).mockResolvedValue(null);
  m(db.listHighlights).mockResolvedValue([]);
  m(db.listMessages).mockResolvedValue([]);
  m(commands.agentNewSession).mockResolvedValue("s1");
  m(commands.agentCancel).mockResolvedValue(undefined);
  await useChatStore.getState().loadForArticle(null);
});

describe("explain", () => {
  it("opens a session, prompts with context, streams and saves the answer", async () => {
    agentReplies("It means one owner.");
    await useChatStore.getState().explain(article, selection);

    const s = useChatStore.getState();
    expect(commands.agentNewSession).toHaveBeenCalledTimes(1);
    expect(db.setChatSession).toHaveBeenCalledWith("c1", "s1");
    const [sessionId, prompt] = m(commands.agentPrompt).mock.calls[0];
    expect(sessionId).toBe("s1");
    expect(prompt).toContain("Ownership in Rust");
    expect(prompt).toContain("Each value");

    expect(s.messages.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(s.messages[0].quote).toBe("Each value");
    expect(s.messages[1].text).toBe("It means one owner.");
    expect(s.streaming).toBe(false);
    expect(s.highlights).toEqual([highlight]);
    // Both sides of the exchange are persisted.
    expect(db.addMessage).toHaveBeenCalledWith(
      "c1",
      "user",
      "Each value",
      "h1",
    );
    expect(db.addMessage).toHaveBeenCalledWith(
      "c1",
      "assistant",
      "It means one owner.",
    );
  });

  it("ignores events from other sessions", async () => {
    agentReplies("mine");
    await useChatStore.getState().explain(article, selection);
    emit({ kind: "token", session_id: "someone-else", text: "leak" });
    expect(last(useChatStore.getState().messages)?.text).toBe("mine");
  });

  it("does nothing while a reply is already streaming", async () => {
    useChatStore.setState({ streaming: true });
    await useChatStore.getState().explain(article, selection);
    expect(commands.agentPrompt).not.toHaveBeenCalled();
  });
});

describe("stop", () => {
  it("cancels the live session and keeps what streamed so far", async () => {
    let finish!: () => void;
    m(commands.agentPrompt).mockImplementation(
      (sessionId: string) =>
        new Promise<void>((resolve) => {
          emit({ kind: "token", session_id: sessionId, text: "partial" });
          finish = () => {
            emit({ kind: "done", session_id: sessionId });
            resolve();
          };
        }),
    );

    const running = useChatStore.getState().explain(article, selection);
    await vi.waitFor(() =>
      expect(last(useChatStore.getState().messages)?.text).toBe("partial"),
    );

    await useChatStore.getState().stop();
    expect(commands.agentCancel).toHaveBeenCalledWith("s1");

    finish(); // the agent ends the turn after the cancel
    await running;
    expect(useChatStore.getState().streaming).toBe(false);
    expect(db.addMessage).toHaveBeenCalledWith("c1", "assistant", "partial");
  });

  it("is a no-op when nothing is streaming", async () => {
    await useChatStore.getState().stop();
    expect(commands.agentCancel).not.toHaveBeenCalled();
  });
});

describe("errors and retry", () => {
  it("classifies the failure, drops the partial answer, and retry re-runs the turn", async () => {
    m(commands.agentPrompt).mockRejectedValueOnce(
      new Error("You've hit your usage limit"),
    );
    await useChatStore.getState().explain(article, selection);

    let s = useChatStore.getState();
    expect(s.error?.kind).toBe("usage_limit");
    expect(s.streaming).toBe(false);
    expect(s.messages.map((x) => x.role)).toEqual(["user"]);

    agentReplies("ok now");
    await useChatStore.getState().retry();
    s = useChatStore.getState();
    expect(s.error).toBeNull();
    expect(last(s.messages)?.text).toBe("ok now");
    expect(commands.agentPrompt).toHaveBeenCalledTimes(2);
  });

  it("surfaces denied permission requests as an error", async () => {
    agentReplies("x");
    await useChatStore.getState().explain(article, selection);
    emit({
      kind: "permission_request",
      session_id: "s1",
      description: "write a file",
    });
    expect(useChatStore.getState().error?.message).toContain("write a file");
  });
});

describe("restoring a saved chat", () => {
  const saved = { id: "c1", articleId: "a1", acpSessionId: "old-session" };

  beforeEach(async () => {
    m(db.getChatForArticle).mockResolvedValue(saved);
    m(db.listHighlights).mockResolvedValue([highlight]);
    m(db.listMessages).mockResolvedValue([
      { id: "m1", role: "user", content: "Each value", highlight },
      {
        id: "m2",
        role: "assistant",
        content: "Earlier answer",
        highlight: null,
      },
    ]);
    await useChatStore.getState().loadForArticle("a1");
  });

  it("loads messages and highlights", () => {
    const s = useChatStore.getState();
    expect(s.messages.map((x) => x.text)).toEqual([
      "Each value",
      "Earlier answer",
    ]);
    expect(s.messages[0].highlightId).toBe("h1");
    expect(s.highlights).toEqual([highlight]);
  });

  it("resumes the saved session and sends a follow up as plain text", async () => {
    m(commands.agentResumeSession).mockResolvedValue(undefined);
    agentReplies("answer");
    await useChatStore.getState().send(article, "why?");

    expect(commands.agentResumeSession).toHaveBeenCalledWith("old-session");
    expect(commands.agentNewSession).not.toHaveBeenCalled();
    expect(m(commands.agentPrompt).mock.calls[0]).toEqual([
      "old-session",
      "why?",
    ]);
  });

  it("falls back to a new session and re-sends the passage context", async () => {
    m(commands.agentResumeSession).mockRejectedValue(
      new Error("session not found"),
    );
    agentReplies("answer");
    await useChatStore.getState().send(article, "why?");

    expect(commands.agentNewSession).toHaveBeenCalled();
    expect(db.setChatSession).toHaveBeenCalledWith("c1", "s1");
    const [sessionId, prompt] = m(commands.agentPrompt).mock.calls[0];
    expect(sessionId).toBe("s1");
    expect(prompt).toContain("follow-up question");
    expect(prompt).toContain("why?");
    expect(prompt).toContain("Each value"); // the highlight it refers to
  });

  it("regenerate replaces the last answer", async () => {
    m(commands.agentResumeSession).mockResolvedValue(undefined);
    agentReplies("better answer");
    await useChatStore.getState().regenerate(article);

    expect(db.deleteLastAssistantMessage).toHaveBeenCalledWith("c1");
    const texts = useChatStore.getState().messages.map((x) => x.text);
    expect(texts).toEqual(["Each value", "better answer"]);
    // The explain prompt is rebuilt from the saved highlight.
    expect(m(commands.agentPrompt).mock.calls[0][1]).toContain(
      "Explain the selected passage",
    );
  });

  it("ignores a stale load when the user switched articles", async () => {
    m(db.getChatForArticle).mockImplementation(async (id: string) =>
      id === "a1" ? saved : null,
    );
    m(db.listMessages).mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(
            () =>
              r([{ id: "x", role: "user", content: "stale", highlight: null }]),
            20,
          ),
        ),
    );
    const slow = useChatStore.getState().loadForArticle("a1");
    await useChatStore.getState().loadForArticle("a2");
    await slow;
    expect(useChatStore.getState().articleId).toBe("a2");
    expect(useChatStore.getState().messages).toEqual([]);
  });
});

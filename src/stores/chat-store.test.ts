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
  relatedArticles: vi.fn(),
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
  m(db.relatedArticles).mockResolvedValue([]);
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

  it("sends full article context on the first explain, but skips it on a second explain in the same live session", async () => {
    m(db.addHighlight)
      .mockResolvedValueOnce(highlight)
      .mockResolvedValueOnce({
        ...highlight,
        id: "h2",
        blockIndex: 1,
        text: "Second paragraph.",
      });
    agentReplies("first answer");
    await useChatStore.getState().explain(article, selection);
    const firstPrompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(firstPrompt).toContain("Article context:");

    agentReplies("second answer");
    await useChatStore.getState().explain(article, {
      ...selection,
      blockIndex: 1,
      text: "Second paragraph.",
    });
    // Still the same session: no new session was opened for the second ask.
    expect(commands.agentNewSession).toHaveBeenCalledTimes(1);
    const secondPrompt = m(commands.agentPrompt).mock.calls[1][1];
    expect(secondPrompt).not.toContain("Article context:");
    // The passage and task are still present even without re-sent context.
    expect(secondPrompt).toContain('"""\nSecond paragraph.\n"""');
  });

  it("includes related articles from the library, looked up by the passage text", async () => {
    m(db.relatedArticles).mockResolvedValue([
      {
        articleId: "a2",
        title: "Lifetimes Explained",
        snippet: "closely tied to ownership",
      },
    ]);
    agentReplies("answer");
    await useChatStore.getState().explain(article, selection);

    expect(db.relatedArticles).toHaveBeenCalledWith("a1", "Each value");
    const prompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(prompt).toContain("Lifetimes Explained");
  });

  it("applies the explain-level and code-example preferences to every prompt", async () => {
    const { useUiStore } = await import("@/stores/ui-store");
    useUiStore
      .getState()
      .setExplainPrefs({ level: "beginner", codeExamples: "always" });
    try {
      agentReplies("answer");
      await useChatStore.getState().explain(article, selection);
      const prompt = m(commands.agentPrompt).mock.calls[0][1];
      expect(prompt).toContain("The developer is new to this topic");
      expect(prompt).toContain("Always include a short code example.");
    } finally {
      useUiStore
        .getState()
        .setExplainPrefs({ level: "balanced", codeExamples: "helpful" });
    }
  });

  it("adds no personalization notes for the default preferences", async () => {
    agentReplies("answer");
    await useChatStore.getState().explain(article, selection);
    const prompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(prompt).not.toContain("The developer is new to this topic");
    expect(prompt).not.toContain("Always include a short code example");
  });

  it("never sends an image's src/alt to the related-articles search", async () => {
    m(db.addHighlight).mockResolvedValue({
      ...highlight,
      text: "![a diagram](https://x.dev/d.png)",
    });
    agentReplies("x");
    await useChatStore.getState().explain(article, selection);
    expect(db.relatedArticles).not.toHaveBeenCalled();
  });

  it("still sends the explanation even if the related-articles search fails", async () => {
    m(db.relatedArticles).mockRejectedValue(new Error("fts broke"));
    agentReplies("answer");
    await useChatStore.getState().explain(article, selection);
    expect(useChatStore.getState().error).toBeNull();
    const prompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(prompt).not.toContain("other articles the developer has saved");
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

describe("askAbout", () => {
  it("asks the user's own question about the selected passage", async () => {
    agentReplies("Because of RAII.");
    await useChatStore
      .getState()
      .askAbout(article, selection, "  why is it dropped?  ");

    const [sessionId, prompt] = m(commands.agentPrompt).mock.calls[0];
    expect(sessionId).toBe("s1");
    expect(prompt).toContain(
      "The developer asks about this passage:\nwhy is it dropped?",
    );
    expect(prompt).toContain("Each value");
    expect(prompt).not.toContain("follow-up question");

    const s = useChatStore.getState();
    expect(s.messages[0]).toMatchObject({
      role: "user",
      text: "why is it dropped?",
      quote: "Each value",
    });
    // The question (not just the passage) is what gets saved.
    expect(db.addMessage).toHaveBeenCalledWith(
      "c1",
      "user",
      "why is it dropped?",
      "h1",
    );
  });

  it("falls back to a plain explanation when the question is empty", async () => {
    agentReplies("x");
    await useChatStore.getState().askAbout(article, selection, "   ");
    expect(m(commands.agentPrompt).mock.calls[0][1]).toContain(
      "Explain the selected passage",
    );
    expect(useChatStore.getState().messages[0].text).toBe("Explain this");
  });

  it("opens the answer sheet", async () => {
    const { useUiStore } = await import("@/stores/ui-store");
    useUiStore.getState().setAnswerOpen(false);
    agentReplies("x");
    await useChatStore.getState().askAbout(article, selection, "why?");
    expect(useUiStore.getState().answerOpen).toBe(true);
  });

  it("regenerating an asked question re-asks the same question", async () => {
    agentReplies("first");
    await useChatStore
      .getState()
      .askAbout(article, selection, "why is it dropped?");
    agentReplies("second");
    await useChatStore.getState().regenerate(article);
    const prompts = m(commands.agentPrompt).mock.calls.map((c) => c[1]);
    expect(prompts[1]).toContain("why is it dropped?");
    expect(prompts[1]).not.toContain("Explain the selected passage");
  });

  it("restores an asked question as the question, not as 'Explain this'", async () => {
    m(db.getChatForArticle).mockResolvedValue({
      id: "c1",
      articleId: "a1",
      acpSessionId: "old",
    });
    m(db.listHighlights).mockResolvedValue([highlight]);
    m(db.listMessages).mockResolvedValue([
      { id: "m1", role: "user", content: "why is it dropped?", highlight },
      {
        id: "m2",
        role: "assistant",
        content: "Because of RAII.",
        highlight: null,
      },
    ]);
    await useChatStore.getState().loadForArticle("a1");
    expect(useChatStore.getState().messages.map((x) => x.text)).toEqual([
      "why is it dropped?",
      "Because of RAII.",
    ]);
  });
});

describe("explainImage", () => {
  const image = {
    blockIndex: 1,
    src: "https://cdn.x/diagram.png",
    alt: "Pod diagram",
  };
  const imageMarkdown = "![Pod diagram](https://cdn.x/diagram.png)";
  const imageHighlight = {
    id: "h-img",
    articleId: "a1",
    blockIndex: 1,
    startOffset: 0,
    endOffset: 0,
    text: imageMarkdown,
  };

  beforeEach(() => {
    m(db.addHighlight).mockResolvedValue(imageHighlight);
  });

  it("attaches the image and asks about it, not about a text passage", async () => {
    agentReplies("It shows a pod.");
    await useChatStore.getState().explainImage(article, image);

    expect(m(db.addHighlight).mock.calls[0][0]).toMatchObject({
      blockIndex: 1,
      startOffset: 0,
      endOffset: 0,
      text: imageMarkdown,
    });
    const [sessionId, prompt, imageUrl] = m(commands.agentPrompt).mock.calls[0];
    expect(sessionId).toBe("s1");
    expect(imageUrl).toBe("https://cdn.x/diagram.png");
    expect(prompt).toContain("attached image");
    expect(prompt).toContain("Selected image: Pod diagram");
    expect(prompt).not.toContain('"""'); // no quoted passage
    expect(useChatStore.getState().messages[0]?.quote).toBe(imageMarkdown);
  });

  it("does not attach anything for an ordinary text question", async () => {
    m(db.addHighlight).mockResolvedValue(highlight); // a text highlight
    agentReplies("x");
    await useChatStore.getState().explain(article, selection);
    expect(m(commands.agentPrompt).mock.calls[0]).toHaveLength(2);
  });

  it("re-sends the image when regenerating an image answer", async () => {
    m(db.getChatForArticle).mockResolvedValue({
      id: "c1",
      articleId: "a1",
      acpSessionId: "old",
    });
    m(db.listHighlights).mockResolvedValue([imageHighlight]);
    m(db.listMessages).mockResolvedValue([
      {
        id: "m1",
        role: "user",
        content: imageMarkdown,
        highlight: imageHighlight,
      },
      { id: "m2", role: "assistant", content: "First answer", highlight: null },
    ]);
    m(commands.agentResumeSession).mockResolvedValue(undefined);
    await useChatStore.getState().loadForArticle("a1");

    agentReplies("Second answer");
    await useChatStore.getState().regenerate(article);
    expect(m(commands.agentPrompt).mock.calls[0][2]).toBe(
      "https://cdn.x/diagram.png",
    );
  });

  it("re-sends the image with a follow up when the session had to be recreated", async () => {
    m(db.getChatForArticle).mockResolvedValue({
      id: "c1",
      articleId: "a1",
      acpSessionId: "old",
    });
    m(db.listHighlights).mockResolvedValue([imageHighlight]);
    m(db.listMessages).mockResolvedValue([
      {
        id: "m1",
        role: "user",
        content: imageMarkdown,
        highlight: imageHighlight,
      },
      { id: "m2", role: "assistant", content: "First answer", highlight: null },
    ]);
    m(commands.agentResumeSession).mockRejectedValue(
      new Error("session not found"),
    );
    await useChatStore.getState().loadForArticle("a1");

    agentReplies("More detail");
    await useChatStore.getState().send(article, "what is the arrow?");
    const [, prompt, imageUrl] = m(commands.agentPrompt).mock.calls[0];
    expect(imageUrl).toBe("https://cdn.x/diagram.png");
    expect(prompt).toContain("what is the arrow?");
  });

  it("shows a failed image download as an error the user can read", async () => {
    m(commands.agentPrompt).mockRejectedValue(
      new Error("SVG diagrams can't be sent to the agent as images."),
    );
    await useChatStore.getState().explainImage(article, image);
    expect(useChatStore.getState().error?.message).toContain("SVG");
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
      "Explain this",
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
    expect(texts).toEqual(["Explain this", "better answer"]);
    // The explain prompt is rebuilt from the saved highlight.
    expect(m(commands.agentPrompt).mock.calls[0][1]).toContain(
      "Explain the selected passage",
    );
  });

  it("tells a freshly recreated session what was already explained elsewhere in the article", async () => {
    const h2 = {
      ...highlight,
      id: "h2",
      blockIndex: 1,
      text: "Second paragraph.",
    };
    m(db.listHighlights).mockResolvedValue([highlight, h2]);
    m(db.listMessages).mockResolvedValue([
      { id: "m1", role: "user", content: "Each value", highlight },
      {
        id: "m2",
        role: "assistant",
        content: "Ownership means one owner.",
        highlight: null,
      },
      { id: "m3", role: "user", content: "Second paragraph.", highlight: h2 },
      {
        id: "m4",
        role: "assistant",
        content: "This is the second block.",
        highlight: null,
      },
    ]);
    await useChatStore.getState().loadForArticle("a1");

    m(db.addHighlight).mockResolvedValue(h2);
    m(commands.agentResumeSession).mockRejectedValue(
      new Error("session not found"),
    );
    agentReplies("third answer");
    // Explaining h2 again (its own prior turn) should mention only h1, not itself.
    await useChatStore.getState().explain(article, h2);

    const prompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(prompt).toContain("Already explained elsewhere in this article:");
    expect(prompt).toContain('"Each value" — Ownership means one owner.');
    expect(prompt).not.toContain("This is the second block.");
  });

  it("does not mention prior explanations when the session resumes successfully", async () => {
    m(commands.agentResumeSession).mockResolvedValue(undefined);
    agentReplies("answer");
    await useChatStore.getState().send(article, "why?");
    const prompt = m(commands.agentPrompt).mock.calls[0][1];
    expect(prompt).toBe("why?"); // plain text: no context, no prior-explanations section at all
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

import { describe, expect, it } from "vitest";
import {
  applyProgress,
  attachTrace,
  emptyProgress,
  hasProgress,
  stepTitle,
  type Progress,
} from "@/lib/agent-progress";

const sid = "s1";

describe("applyProgress", () => {
  it("collects thinking in order", () => {
    let p = applyProgress(emptyProgress, {
      kind: "thought",
      session_id: sid,
      text: "Let me ",
    });
    p = applyProgress(p, { kind: "thought", session_id: sid, text: "look." });
    expect(p.thinking).toBe("Let me look.");
  });

  it("adds a step, then updates it without losing its name", () => {
    let p = applyProgress(emptyProgress, {
      kind: "step",
      session_id: sid,
      id: "t1",
      title: "Search the library",
      status: "pending",
    });
    p = applyProgress(p, {
      kind: "step",
      session_id: sid,
      id: "t1",
      title: null,
      status: "completed",
    });
    expect(p.steps).toEqual([
      { id: "t1", title: "Search the library", status: "completed" },
    ]);
  });

  it("gives Yomu's own tools a plain name", () => {
    const p = applyProgress(emptyProgress, {
      kind: "step",
      session_id: sid,
      id: "t1",
      title: "mcp.yomu.search_library",
      status: "pending",
    });
    expect(p.steps[0].title).toBe("Searching your library");
    expect(stepTitle("mcp.other.thing")).toBe("mcp.other.thing");
    expect(stepTitle("Run a command")).toBe("Run a command");
  });

  it("keeps separate steps apart", () => {
    let p = emptyProgress;
    for (const id of ["a", "b"]) {
      p = applyProgress(p, {
        kind: "step",
        session_id: sid,
        id,
        title: id,
        status: "pending",
      });
    }
    expect(p.steps.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("takes the plan and the usage", () => {
    let p = applyProgress(emptyProgress, {
      kind: "plan",
      session_id: sid,
      entries: [{ content: "Answer", status: "in_progress" }],
    });
    p = applyProgress(p, {
      kind: "usage",
      session_id: sid,
      used: 10,
      size: 100,
    });
    expect(p.plan).toHaveLength(1);
    expect(p.usage).toEqual({ used: 10, size: 100 });
  });

  it("ignores events about the answer itself", () => {
    const p = applyProgress(emptyProgress, {
      kind: "token",
      session_id: sid,
      text: "hi",
    });
    expect(p).toBe(emptyProgress);
  });

  it("knows when there is something to show", () => {
    expect(hasProgress(emptyProgress)).toBe(false);
    expect(
      hasProgress(
        applyProgress(emptyProgress, {
          kind: "thought",
          session_id: sid,
          text: "x",
        }),
      ),
    ).toBe(true);
  });
});

describe("attachTrace", () => {
  const worked = applyProgress(emptyProgress, {
    kind: "thought",
    session_id: sid,
    text: "x",
  });

  it("puts what the agent did on the answer it led to", () => {
    const messages = [
      { role: "user", text: "q" },
      { role: "assistant", text: "a" },
    ];
    const out = attachTrace<{ role: string; text: string; trace?: Progress }>(
      messages,
      worked,
    );
    expect(out[1].trace).toBe(worked);
    expect(out[0]).toBe(messages[0]);
  });

  it("leaves a turn that did nothing visible, or an unanswered one, alone", () => {
    const answered = [{ role: "assistant", text: "a" }];
    expect(attachTrace(answered, emptyProgress)).toBe(answered);
    const asked = [{ role: "user", text: "q" }];
    expect(attachTrace(asked, worked)).toBe(asked);
  });
});

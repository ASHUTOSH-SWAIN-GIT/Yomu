import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  listComments: vi.fn(async () => []),
  addComment: vi.fn(async (c: object) => ({ ...c, id: "c1", createdAt: 1 })),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

import * as db from "@/lib/db";
import { imageQuote } from "@/lib/images";
import { saveAnswerAsComment } from "@/lib/save-answer";
import { useCommentsStore } from "@/stores/comments-store";

const highlight = {
  id: "h1",
  articleId: "a1",
  blockIndex: 2,
  startOffset: 4,
  endOffset: 9,
  text: "owner",
};

beforeEach(async () => {
  vi.clearAllMocks();
  await useCommentsStore.getState().load("a1");
});

describe("saveAnswerAsComment", () => {
  it("puts the answer on the words it was about", async () => {
    await saveAnswerAsComment(highlight, "One owner at a time.");
    expect(db.addComment).toHaveBeenCalledWith({
      articleId: "a1",
      blockIndex: 2,
      start: 4,
      end: 9,
      quote: "owner",
      note: "One owner at a time.",
    });
    expect(useCommentsStore.getState().items).toHaveLength(1);
  });

  it("puts an answer about a picture on the picture as a whole", async () => {
    await saveAnswerAsComment(
      { ...highlight, text: imageQuote("A diagram", "https://x/y.png") },
      "It shows the layers.",
    );
    expect(db.addComment).toHaveBeenCalledWith(
      expect.objectContaining({ start: 0, end: 0, quote: "" }),
    );
  });
});

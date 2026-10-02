import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "@/stores/selection-store";

const passage = { blockIndex: 0, startOffset: 0, endOffset: 4, text: "text" };

beforeEach(() => {
  useSelectionStore.setState({ selection: null, replyTo: null });
});

describe("selection store", () => {
  it("replying to a note drops the attached passage", () => {
    useSelectionStore.getState().set(passage);
    useSelectionStore.getState().setReplyTo({ highlightId: "h1", number: 2 });
    expect(useSelectionStore.getState().selection).toBeNull();
    expect(useSelectionStore.getState().replyTo?.number).toBe(2);
  });

  it("selecting a new passage drops the note being replied to", () => {
    useSelectionStore.getState().setReplyTo({ highlightId: "h1", number: 2 });
    useSelectionStore.getState().set(passage);
    expect(useSelectionStore.getState().replyTo).toBeNull();
    expect(useSelectionStore.getState().selection).toEqual(passage);
  });

  it("clearing the selection keeps a note reply (a click in the bar collapses it)", () => {
    useSelectionStore.getState().setReplyTo({ highlightId: "h1", number: 2 });
    useSelectionStore.getState().set(null);
    expect(useSelectionStore.getState().replyTo?.highlightId).toBe("h1");
  });
});

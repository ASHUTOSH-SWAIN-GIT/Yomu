import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, useToastStore } from "@/stores/toast-store";

afterEach(() => {
  vi.useRealTimers();
  useToastStore.getState().dismiss();
});

describe("toast", () => {
  it("shows one note at a time, the newest", () => {
    toast("First");
    toast("Second");
    expect(useToastStore.getState().toast?.message).toBe("Second");
  });

  it("goes away on its own, later when it has an action", () => {
    vi.useFakeTimers();
    toast("Exported");
    vi.advanceTimersByTime(3100);
    expect(useToastStore.getState().toast).toBeNull();

    toast("Archived", { label: "Undo", run: () => {} });
    vi.advanceTimersByTime(3100);
    expect(useToastStore.getState().toast?.message).toBe("Archived");
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it("an old note's timer does not close a newer one", () => {
    vi.useFakeTimers();
    toast("Old");
    vi.advanceTimersByTime(2000);
    toast("New");
    vi.advanceTimersByTime(1500);
    expect(useToastStore.getState().toast?.message).toBe("New");
  });
});

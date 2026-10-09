import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp } from "lucide-react";
import type { CommentSelection } from "@/hooks/use-comment-selection";
import { useAgentStore } from "@/stores/agent-store";
import { useChatStore } from "@/stores/chat-store";
import { useUiStore } from "@/stores/ui-store";
import { useViewStore } from "@/stores/view-store";
import type { StoredArticle } from "@/types/library";

/** A small box beside the words you selected, for asking about them. Enter
 * sends your question; with nothing typed it explains the passage. The
 * answer appears in the chat. */
export function AskBox({
  article,
  selection,
  onDone,
}: {
  article: StoredArticle;
  selection: CommentSelection;
  onDone: () => void;
}) {
  const askAbout = useChatStore((s) => s.askAbout);
  const setChatOpen = useViewStore((s) => s.setChatOpen);
  const [question, setQuestion] = useState("");
  const box = useRef<HTMLFormElement>(null);
  const { rect, anchor } = selection;
  const above = rect.top > 150;

  // It goes away on a click elsewhere, on Escape, and when the page moves
  // (it is placed by where the words were).
  useEffect(() => {
    const close = () => onDone();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, { capture: true });
    };
  }, [onDone]);

  function submit() {
    // Without a connected agent there is nothing to ask; show how to set
    // one up instead.
    if (useAgentStore.getState().status !== "ready") {
      useUiStore.getState().setSetupOpen(true);
    } else {
      setChatOpen(true);
      void askAbout(
        article,
        {
          blockIndex: anchor.blockIndex,
          startOffset: anchor.start,
          endOffset: anchor.end,
          text: anchor.quote,
        },
        question,
      );
    }
    onDone();
  }

  return createPortal(
    <form
      ref={box}
      data-comment-ui
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="pop-in bg-popover text-popover-foreground fixed z-50 flex w-[min(22rem,calc(100vw-1rem))] flex-col gap-2 rounded-2xl p-3 font-sans shadow-[var(--shadow-float)]"
      style={{
        left: Math.min(
          Math.max(8, rect.left + rect.width / 2),
          window.innerWidth - 8,
        ),
        top: above ? rect.top - 8 : rect.bottom + 8,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
    >
      <p className="text-muted-foreground border-border line-clamp-2 border-l-2 pl-2 text-[0.75rem] italic">
        {anchor.quote}
      </p>
      <div className="bg-muted flex items-center gap-2 rounded-xl py-1 pr-1 pl-3">
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this, or press Enter to explain"
          aria-label="Ask about the selected words"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1.5 text-[0.8125rem] outline-none"
        />
        <button
          type="submit"
          aria-label={question.trim() ? "Ask" : "Explain"}
          className="bg-primary text-primary-foreground focus-visible:ring-ring/60 grid size-7 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>,
    document.body,
  );
}

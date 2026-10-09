import { Sparkles } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import type { PassageAnswer } from "@/lib/exchanges";
import { useViewStore } from "@/stores/view-store";

/** An answer about some words, beside them. A long one is cut short here;
 * the chat has all of it and the rest of the conversation. */
export function AnswerCard({ item }: { item: PassageAnswer }) {
  const setChatOpen = useViewStore((s) => s.setChatOpen);
  return (
    <div
      data-answer-card
      className="border-border bg-card relative rounded-xl border px-3.5 py-3 text-[0.8125rem] leading-relaxed"
    >
      <p className="text-muted-foreground flex items-center gap-1.5 text-[0.75rem] font-medium">
        <Sparkles className="size-3.5" aria-hidden />
        {item.question ?? "Explained"}
      </p>
      <div className="relative mt-1 max-h-44 overflow-hidden [&_p]:my-1.5">
        <Markdown>{item.answer}</Markdown>
        {item.answer.length > 420 && (
          <div
            aria-hidden
            className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mt-1.5 rounded-sm text-[0.75rem] underline underline-offset-2 outline-none focus-visible:ring-2"
      >
        Open in chat
      </button>
    </div>
  );
}

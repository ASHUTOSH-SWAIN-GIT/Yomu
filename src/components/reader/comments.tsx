import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import {
  ArrowUp,
  Copy,
  MessageSquareText,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AnswerCard } from "@/components/reader/answer-card";
import { passageAnswers } from "@/lib/exchanges";
import { useChatStore } from "@/stores/chat-store";
import type { CommentSelection } from "@/hooks/use-comment-selection";
import { rangeOfWords } from "@/hooks/use-comment-highlights";
import { RESTACK } from "@/hooks/use-margin-stack";
import { cn } from "@/lib/utils";
import { useCommentsStore } from "@/stores/comments-store";
import type { Comment } from "@/types/library";

const buttonClass =
  "hover:bg-accent focus-visible:ring-ring/60 flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-sans text-[0.8125rem] outline-none focus-visible:ring-2 [&>svg]:size-3.5";

/** What is offered over selected text: ask the agent about it, comment, or
 * copy it. */
export function AddCommentButton({
  selection,
  onAsk,
  onDone,
}: {
  selection: CommentSelection;
  /** Opens the box for asking about these words (see `AskBox`). */
  onAsk: () => void;
  onDone: () => void;
}) {
  const startDraft = useCommentsStore((s) => s.startDraft);
  const { rect, anchor } = selection;
  // Above the selection, or under it when there is no room above.
  const above = rect.top > 56;
  return createPortal(
    <div
      data-comment-ui
      // Keep the selection: a press here would otherwise clear it.
      onMouseDown={(e) => e.preventDefault()}
      className="pop-in bg-popover text-popover-foreground fixed z-50 flex rounded-xl p-1 shadow-[var(--shadow-float)]"
      style={{
        left: Math.max(8, rect.left + rect.width / 2),
        top: above ? rect.top - 8 : rect.bottom + 8,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
    >
      <button
        type="button"
        onClick={() => {
          onAsk();
          window.getSelection()?.removeAllRanges();
          onDone();
        }}
        className={buttonClass}
      >
        <Sparkles aria-hidden />
        Ask
      </button>
      <button
        type="button"
        onClick={() => {
          startDraft(anchor);
          window.getSelection()?.removeAllRanges();
          onDone();
        }}
        className={buttonClass}
      >
        <MessageSquareText aria-hidden />
        Add comment
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(anchor.quote);
          window.getSelection()?.removeAllRanges();
          onDone();
        }}
        className={buttonClass}
      >
        <Copy aria-hidden />
        Copy
      </button>
    </div>,
    document.body,
  );
}

/** What sits with a paragraph: its saved comments, and the box for a new
 * one. `beside` puts them in the margin to the right of the paragraph, level
 * with the words they are about (where there is room); otherwise they go
 * just under it. */
export function BlockComments({
  blockIndex,
  beside,
  articleRef,
}: {
  blockIndex: number;
  beside: boolean;
  articleRef: RefObject<HTMLElement | null>;
}) {
  const items = useCommentsStore((s) => s.items);
  const draft = useCommentsStore((s) => s.draft);
  const asked = useChatStore((s) => s.highlights);
  const messages = useChatStore((s) => s.messages);
  const mine = items.filter((c) => c.blockIndex === blockIndex);
  const writing = draft?.blockIndex === blockIndex ? draft : null;
  // Questions asked about words in this paragraph, with their answers.
  const answers = useMemo(
    () =>
      passageAnswers(asked, messages).filter(
        (a) => a.highlight.blockIndex === blockIndex,
      ),
    [asked, messages, blockIndex],
  );
  const box = useRef<HTMLDivElement>(null);

  // Level with the first words commented on in this paragraph. Measured
  // after each change; the same number sets nothing, so it cannot loop.
  const firstAnswer = answers[0]?.highlight;
  const first =
    writing ??
    mine[0] ??
    (firstAnswer && {
      blockIndex,
      start: firstAnswer.startOffset,
      end: firstAnswer.endOffset,
      quote: firstAnswer.text,
    });
  const firstKey = first ? `${first.start}-${first.end}` : "";
  useLayoutEffect(() => {
    const article = articleRef.current;
    const holder = box.current?.parentElement;
    const el = box.current;
    if (!el) return;
    if (!beside || !first || !article || !holder) {
      el.style.top = "";
      return;
    }
    const rect = rangeOfWords(article, first)?.getClientRects()[0];
    el.style.top = `${
      rect
        ? Math.max(0, Math.round(rect.top - holder.getBoundingClientRect().top))
        : 0
    }px`;
    // Moved by itself: the notes may now need nudging apart.
    article.dispatchEvent(new Event(RESTACK));
    // `first` is described by firstKey; the paragraph's width by `beside`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beside, firstKey, mine.length, answers.length, articleRef]);

  if (mine.length === 0 && !writing && answers.length === 0) return null;
  return (
    <div
      ref={box}
      data-margin-stack
      className={
        beside
          ? "absolute left-full ml-8 flex w-64 flex-col gap-2 font-sans"
          : "my-3 flex flex-col gap-2 font-sans"
      }
    >
      {mine.map((c) => (
        <CommentCard key={c.id} comment={c} />
      ))}
      {answers.map((a) => (
        <AnswerCard key={a.highlight.id} item={a} />
      ))}
      {writing && <DraftBox />}
    </div>
  );
}

function CommentCard({ comment }: { comment: Comment }) {
  const editing = useCommentsStore((s) => s.editingId === comment.id);
  const setEditing = useCommentsStore((s) => s.setEditing);
  const update = useCommentsStore((s) => s.update);
  const remove = useCommentsStore((s) => s.remove);
  // Edit and delete show while the pointer is on the comment (or a key
  // press has focus inside it).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const showActions = !editing && (hovered || focused);
  // Pointing at the words or at the card links them: the card slides toward
  // the text, and the words get a slightly stronger wash.
  const active = useCommentsStore((s) => s.activeId === comment.id);
  const setActive = useCommentsStore((s) => s.setActive);

  return (
    <div
      data-comment-card
      onMouseEnter={() => {
        setHovered(true);
        setActive(comment.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setActive(null);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cn(
        "border-border bg-card relative rounded-xl border px-3.5 py-3 text-[0.875rem] leading-relaxed transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        active && "-translate-x-3",
      )}
    >
      <p className="font-medium">You</p>
      {editing ? (
        <div className="mt-2">
          <Composer
            initial={comment.note}
            placeholder="Edit comment"
            onSend={(text) => void update(comment.id, text)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap">{comment.note}</p>
      )}
      {showActions && (
        <span className="absolute top-2.5 right-2.5 flex gap-0.5">
          <IconButton
            label="Edit comment"
            onClick={() => setEditing(comment.id)}
          >
            <Pencil aria-hidden />
          </IconButton>
          <IconButton
            label="Delete comment"
            onClick={() => void remove(comment.id)}
          >
            <Trash2 aria-hidden />
          </IconButton>
        </span>
      )}
    </div>
  );
}

function DraftBox() {
  const saveDraft = useCommentsStore((s) => s.saveDraft);
  const cancelDraft = useCommentsStore((s) => s.cancelDraft);
  return (
    <Composer
      initial=""
      placeholder="Add a comment…"
      onSend={(text) => void saveDraft(text)}
      onCancel={cancelDraft}
    />
  );
}

/** A rounded box with the text on the left and a round send button on the
 * right. Enter sends, Shift+Enter starts a new line, Escape (or clicking
 * away while empty) gives up. */
function Composer({
  initial,
  placeholder,
  onSend,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="border-border bg-card focus-within:border-input flex items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3.5 text-[0.875rem]">
      <textarea
        autoFocus
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend(text);
          }
        }}
        onBlur={() => !text.trim() && onCancel()}
        placeholder={placeholder}
        aria-label="Comment"
        className="placeholder:text-muted-foreground field-sizing-content max-h-40 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1 leading-5 outline-none"
      />
      <button
        type="button"
        // Pressing it must not blur the box first and throw the text away.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(text)}
        disabled={!text.trim()}
        aria-label="Post comment"
        className="bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground focus-visible:ring-ring/60 grid size-7 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
      >
        <ArrowUp className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 grid size-6 place-items-center rounded-md outline-none focus-visible:ring-2 [&>svg]:size-3.5"
    >
      {children}
    </button>
  );
}

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Inbox,
  Link as LinkIcon,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { goToSettings } from "@/lib/go";
import { openSampleArticle } from "@/lib/sample-article";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { MOD } from "@/lib/platform";

interface Step {
  title: string;
  text: string;
  /** The tint of the card's picture, as a hue (0 to 360). */
  hue: number;
  art: ReactNode;
  keys?: [string, string][];
  /** A way to try it now, shown as a link under the text. */
  action?: { label: string; run: () => void };
}

/* Each picture is drawn with the app's own colours, so it matches the theme
 * in use, on a soft tint that tells the steps apart. */

function Window({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-background text-caption w-full overflow-hidden rounded-xl shadow-[var(--shadow-sheet)]",
        className,
      )}
    >
      {/* The macOS window buttons, only where the real window has them. */}
      <div className="hidden gap-1 px-3 pt-2.5 [.platform-mac_&]:flex">
        <i className="size-1.5 rounded-full bg-[#ff5f57]" />
        <i className="size-1.5 rounded-full bg-[#febc2e]" />
        <i className="size-1.5 rounded-full bg-[#28c840]" />
      </div>
      {children}
    </div>
  );
}

/** Lines standing in for text. */
function Lines({
  widths,
  className,
}: {
  widths: number[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {widths.map((w, i) => (
        <i
          key={i}
          className="bg-foreground/15 block h-1.5 rounded-full"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

const STEPS: Step[] = [
  {
    title: "Welcome to Yomu",
    text: "A calm place to read blogs, docs and research papers, with your own AI agent beside every page. Here's a quick look at what you can do.",
    hue: 28,
    art: (
      <div className="flex flex-col items-center gap-3">
        <img
          src="/welcome/icon.png"
          alt=""
          draggable={false}
          className="size-20 drop-shadow-[0_12px_24px_rgb(0_0_0/0.25)]"
        />
        <span className="text-foreground/70 text-lead font-serif italic">
          読む · to read
        </span>
      </div>
    ),
  },
  {
    title: "Save anything worth reading",
    text: "Paste a link on Home and it opens as a clean page, without ads or popups. Everything you open stays in your library.",
    hue: 210,
    keys: [[`${MOD}⇧V`, "Open the link you copied"]],
    art: (
      <Window>
        <div className="flex flex-col gap-3 p-3.5">
          <div className="bg-muted flex items-center gap-2 rounded-lg px-2.5 py-2">
            <LinkIcon className="text-muted-foreground size-3" />
            <span className="text-muted-foreground flex-1 truncate">
              https://blog.example.com/how-databases-work
            </span>
            <span className="bg-foreground text-background text-micro rounded px-1.5 py-0.5 font-medium">
              Open
            </span>
          </div>
          <div className="px-1">
            <p className="text-lead font-serif font-semibold">
              How databases work
            </p>
            <Lines widths={[96, 88, 92, 60]} className="mt-2" />
          </div>
        </div>
      </Window>
    ),
  },
  {
    title: "Read research papers, page by page",
    text: "Open a PDF, or drop several on the window. Yomu turns columns, footnotes and references into readable text you turn like a book.",
    hue: 265,
    keys: [
      [`${MOD}O`, "Open a PDF"],
      ["← →", "Turn the page"],
    ],
    art: (
      <Window>
        <div className="flex flex-col gap-2.5 px-5 pt-3 pb-3">
          <p className="text-muted-foreground text-micro">Page 4 of 14</p>
          <p className="text-prose font-serif font-semibold">
            3 &nbsp;Data Model
          </p>
          <Lines widths={[98, 94, 97, 70]} />
          <div className="bg-card mx-auto mt-1 flex items-center gap-2 rounded-full px-2.5 py-1 shadow-[var(--shadow-card)]">
            <ChevronLeft className="text-muted-foreground size-3" />
            <span className="text-muted-foreground text-micro">
              Page <b className="text-foreground">4</b> of 14
            </span>
            <ChevronRight className="size-3" />
          </div>
        </div>
      </Window>
    ),
  },
  {
    title: "Bookmarks arrive in your Inbox",
    text: "Bookmark a page into a folder named Yomu in Chrome, Brave or Helium. It's saved to your Inbox, even when you bookmark it on your phone.",
    hue: 45,
    art: (
      <div className="flex w-full flex-col gap-2.5">
        <div className="bg-background text-caption mx-auto flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-[var(--shadow-card)]">
          <Star className="size-3 fill-[#e2602b] text-[#e2602b]" />
          <span className="text-muted-foreground">Added to</span>
          <Folder className="size-3" />
          <b className="font-medium">Yomu</b>
        </div>
        <Window>
          <div className="px-3.5 pt-2 pb-3">
            <p className="flex items-center gap-1.5 font-medium">
              <Inbox className="size-3" /> Inbox
              <span className="text-muted-foreground text-micro ml-auto">
                3 new
              </span>
            </p>
            {["Consistent hashing", "Inside the Tokio scheduler"].map((t) => (
              <div
                key={t}
                className="border-border mt-2 flex items-center gap-2 border-t pt-2"
              >
                <span className="bg-muted size-4 rounded" />
                <span className="text-meta font-serif">{t}</span>
              </div>
            ))}
          </div>
        </Window>
      </div>
    ),
  },
  {
    title: "Ask your own agent",
    text: "Turn on Codex, Claude Code or OpenCode, the agent you already use. Ask about the article you're reading, or chat with your whole library.",
    hue: 150,
    keys: [
      [`${MOD}E`, "Chat beside the article"],
      [`${MOD}N`, "Chat with your library"],
    ],
    action: { label: "Choose an agent", run: () => goToSettings("agent") },
    art: (
      <Window>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Chat</span>
            <span className="bg-muted text-muted-foreground text-micro rounded-full px-2 py-0.5">
              ● Claude Code · Ready
            </span>
          </div>
          <div className="bg-foreground text-background ml-auto max-w-[75%] rounded-xl rounded-br-sm px-2.5 py-1.5">
            Why doesn't a reader block the writer?
          </div>
          <div className="max-w-[90%] leading-snug">
            Each reader works from a snapshot of the log, so the writer can keep
            appending.
          </div>
          <div className="bg-muted text-muted-foreground mt-1 flex items-center rounded-lg px-2.5 py-1.5">
            Ask about this article
            <span className="bg-foreground text-background ml-auto grid size-4 place-items-center rounded-full">
              <ArrowUp className="size-2.5" />
            </span>
          </div>
        </div>
      </Window>
    ),
  },
  {
    title: "Notes and collections",
    text: "Select any passage to leave a note in the margin. Sort what you read into collections, and keep several things open in tabs.",
    hue: 340,
    art: (
      <Window>
        <div className="flex gap-3 p-3.5">
          <div className="flex-1">
            <Lines widths={[94, 88]} />
            <p className="text-meta mt-1.5 font-serif leading-snug">
              <mark className="text-foreground rounded-sm bg-[var(--mark-active)] px-0.5">
                Readers never block writers
              </mark>{" "}
              and a writer never blocks readers.
            </p>
            <Lines widths={[90, 70]} className="mt-1.5" />
          </div>
          <div className="bg-card w-28 shrink-0 self-start rounded-lg p-2 shadow-[var(--shadow-card)]">
            <span className="text-muted-foreground text-micro">1 · you</span>
            <p className="mt-0.5 leading-snug">Same idea as MVCC?</p>
          </div>
        </div>
        <div className="border-border text-muted-foreground flex gap-3 border-t px-3.5 py-2">
          <span className="flex items-center gap-1">
            <Folder className="size-3" /> Databases
          </span>
          <span className="flex items-center gap-1">
            <Folder className="size-3" /> Rust
          </span>
        </div>
      </Window>
    ),
  },
  {
    title: `Find anything with ${MOD}K`,
    text: "Search your library and chats, jump to any page, heading or tab, and switch themes. Focus mode hides everything but the words.",
    hue: 190,
    keys: [
      [`${MOD}K`, "Search and go anywhere"],
      [`${MOD}.`, "Focus mode"],
      [`${MOD}/`, "All shortcuts"],
    ],
    art: (
      <div className="bg-popover text-caption w-full overflow-hidden rounded-xl shadow-[var(--shadow-float)]">
        <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="text-muted-foreground size-3" />
          <span>spanner</span>
          <span className="bg-foreground/60 h-3 w-px" />
        </div>
        <div className="flex flex-col gap-0.5 p-1.5">
          <div className="bg-accent flex items-center gap-2 rounded-md px-2 py-1.5">
            <FileText className="size-3" /> Spanner: Google's
            Globally-Distributed Database
          </div>
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5">
            <ArrowRight className="size-3" /> In this article · 4 Concurrency
            Control
          </div>
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5">
            <Search className="size-3" /> Go to Papers
          </div>
        </div>
      </div>
    ),
  },
];

/**
 * The welcome tour: what Yomu does, one card at a time. It opens by itself
 * on the very first launch and can be reopened from Cmd+K. Closing it, by
 * finishing, skipping or Escape, marks it seen.
 */
export function WelcomeTour() {
  const open = useUiStore((s) => s.welcomeOpen);
  const setOpen = useUiStore((s) => s.setWelcomeOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[min(34rem,calc(100vw-2rem))] p-0">
        {/* Mounted only while open, so it starts from the first card. */}
        <Tour close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Tour({ close }: { close: () => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length) return;
    setDirection(to > index ? "next" : "prev");
    setIndex(to);
  };

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div
        key={index}
        className={cn(
          direction === "next"
            ? "motion-safe:animate-[yomu-page-next_280ms_cubic-bezier(0.32,0.72,0,1)]"
            : "motion-safe:animate-[yomu-page-prev_280ms_cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div
          className="m-2 mb-0 flex aspect-[16/9] items-center justify-center rounded-xl px-10 py-6"
          style={{
            background: `radial-gradient(120% 90% at 15% 0%, oklch(0.78 0.11 ${step.hue} / 0.45), transparent 70%), radial-gradient(90% 80% at 100% 100%, oklch(0.7 0.12 ${step.hue + 40} / 0.35), transparent 70%), var(--muted)`,
          }}
        >
          {step.art}
        </div>
        <div className="min-h-[11.5rem] px-6 pt-5">
          <p className="text-muted-foreground text-caption font-medium tabular-nums">
            {index + 1} of {STEPS.length}
          </p>
          <DialogTitle className="text-title mt-1 font-semibold tracking-[-0.02em]">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-prose mt-1.5 leading-relaxed">
            {step.text}
          </DialogDescription>
          {step.action && (
            <button
              type="button"
              onClick={() => {
                close();
                step.action?.run();
              }}
              className="text-foreground text-ui mt-3 flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              {step.action.label} <ArrowRight className="size-3.5" />
            </button>
          )}
          {step.keys && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {step.keys.map(([key, label]) => (
                <span
                  key={key}
                  className="text-muted-foreground text-meta flex items-center gap-1.5"
                >
                  <kbd className="bg-muted text-foreground text-caption rounded px-1.5 py-px font-sans">
                    {key}
                  </kbd>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 pt-6 pb-5">
        <div className="flex flex-1 gap-1.5" role="tablist" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}: ${s.title}`}
              onClick={() => go(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index
                  ? "bg-foreground w-5"
                  : "bg-foreground/20 hover:bg-foreground/40 w-1.5",
              )}
            />
          ))}
        </div>
        {!last && (
          <Button
            variant="ghost"
            className="text-muted-foreground rounded-lg"
            onClick={close}
          >
            Skip
          </Button>
        )}
        {index > 0 && (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back"
            className="rounded-lg"
            onClick={() => go(index - 1)}
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        {last ? (
          <>
            <Button
              variant="secondary"
              className="rounded-lg"
              onClick={() => {
                close();
                void openSampleArticle();
              }}
            >
              Read a sample
            </Button>
            <Button className="rounded-lg" autoFocus onClick={close}>
              Start reading
            </Button>
          </>
        ) : (
          <Button
            className="gap-1.5 rounded-lg"
            autoFocus
            onClick={() => go(index + 1)}
          >
            Next <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

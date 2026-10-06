import { ArrowRight } from "lucide-react";
import { openSampleArticle } from "@/lib/sample-article";
import { useLibraryChatStore } from "@/stores/library-chat-store";
import { useSpacesStore } from "@/stores/spaces-store";

/** What a new reader sees before saving anything: four illustrated cards,
 * one per thing Yomu does, each a shortcut to trying it. */
const STEPS = [
  {
    art: "/welcome/link.svg",
    title: "Paste any link",
    text: "Blogs, docs, papers. Each opens as a clean page and is saved for later.",
    action: "Try the tour",
  },
  {
    art: "/welcome/ask.svg",
    title: "Ask about any line",
    text: "Select a passage and ask. The answer appears right beside the words.",
    action: "Open the tour",
  },
  {
    art: "/welcome/chat.svg",
    title: "Chat with your agent",
    text: "Talk with Codex or OpenCode about what you read, or about anything.",
    action: "Start a chat",
  },
  {
    art: "/welcome/collect.svg",
    title: "Comment and collect",
    text: "Leave notes on lines you like and sort blogs into collections.",
    action: "Open settings",
  },
] as const;

export function Welcome() {
  const setLibraryChat = useSpacesStore((s) => s.setLibraryChat);
  const setSettingsPage = useSpacesStore((s) => s.setSettingsPage);
  const resetChat = useLibraryChatStore((s) => s.reset);
  const actions = [
    () => void openSampleArticle(),
    () => void openSampleArticle(),
    () => {
      void resetChat();
      setLibraryChat(true);
    },
    () => setSettingsPage(true),
  ];

  return (
    <section className="mt-12">
      <h2 className="text-muted-foreground text-[0.8125rem] font-medium">
        Getting started
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            type="button"
            onClick={actions[i]}
            className="group bg-card border-border focus-visible:ring-ring/60 flex flex-col overflow-hidden rounded-xl border text-left transition-[translate,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] focus-visible:ring-2"
          >
            <span className="block aspect-[4/3] overflow-hidden">
              <img
                src={step.art}
                alt=""
                draggable={false}
                className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
              />
            </span>
            <span className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
              <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">
                {step.title}
              </span>
              <span className="text-muted-foreground text-[0.75rem] leading-snug">
                {step.text}
              </span>
              <span className="text-foreground/80 mt-1 flex items-center gap-1.5 text-[0.6875rem] font-medium">
                {step.action}
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

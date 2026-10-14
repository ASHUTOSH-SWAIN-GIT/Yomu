import { useEffect, useState } from "react";
import { AgentSection } from "@/components/settings/agent-section";
import { AnswersSection } from "@/components/settings/answers-section";
import { BookmarksSection } from "@/components/settings/bookmarks-section";
import { FeedsSection } from "@/components/settings/feeds-section";
import { DataSection } from "@/components/settings/data-section";
import { ReadingSection } from "@/components/settings/reading-section";
import { Section } from "@/components/settings/controls";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "reading", label: "Appearance and reading" },
  { id: "answers", label: "AI answers" },
  { id: "agent", label: "Agent" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "feeds", label: "Subscriptions" },
  { id: "data", label: "Data" },
];

/** The settings page: one scrolling page, with a row of links to its
 * sections that stays in view and marks the one you are in. */
export function SettingsPage() {
  const current = useCurrentSection();

  return (
    <div className="mx-auto w-full max-w-[44rem] px-8 pt-12 pb-32">
      <h1 className="text-display font-semibold tracking-[-0.025em]">
        Settings
      </h1>
      <nav
        aria-label="Settings sections"
        className="bg-background sticky top-0 z-10 -mx-2 mt-4 mb-6 flex flex-wrap gap-1.5 px-2 py-3"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={current === s.id ? "true" : undefined}
            onClick={() =>
              document
                .getElementById(s.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={cn(
              "focus-visible:ring-ring/60 text-ui h-8 rounded-full px-3.5 outline-none focus-visible:ring-2",
              current === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="divide-border flex flex-col divide-y [&>section]:py-10 [&>section:first-child]:pt-0">
        <ReadingSection />
        <AnswersSection />
        <Section id="agent" title="Agent">
          <AgentSection />
        </Section>
        <BookmarksSection />
        <FeedsSection />
        <DataSection />
      </div>
    </div>
  );
}

/** The section nearest the top of the page as you scroll. */
function useCurrentSection(): string {
  const [current, setCurrent] = useState(SECTIONS[0].id);
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = SECTIONS.find((s) => visible.has(s.id));
        if (first) setCurrent(first.id);
      },
      // A band across the upper part of the window.
      { rootMargin: "-15% 0px -55% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return current;
}

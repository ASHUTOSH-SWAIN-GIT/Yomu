import { AgentSection } from "@/components/settings/agent-section";
import { AnswersSection } from "@/components/settings/answers-section";
import { BookmarksSection } from "@/components/settings/bookmarks-section";
import { DataSection } from "@/components/settings/data-section";
import { ReadingSection } from "@/components/settings/reading-section";
import { Section } from "@/components/settings/controls";

const SECTIONS = [
  { id: "reading", label: "Appearance and reading" },
  { id: "answers", label: "AI answers" },
  { id: "agent", label: "Agent" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "data", label: "Data" },
];

/** The settings page: one scrolling page with a row of links to its
 * sections. */
export function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[44rem] px-8 pt-12 pb-32">
      <h1 className="text-[2rem] font-bold tracking-[-0.025em]">Customize</h1>
      <nav
        aria-label="Customize sections"
        className="mt-5 mb-10 flex flex-wrap gap-2"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              document
                .getElementById(s.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 h-8 rounded-full px-3.5 text-[0.8125rem] outline-none focus-visible:ring-2"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <ReadingSection />
      <div className="border-border mt-10 border-t" />
      <AnswersSection />
      <div className="border-border mt-10 border-t" />
      <Section id="agent" title="Agent">
        <AgentSection />
      </Section>
      <div className="border-border mt-10 border-t" />
      <BookmarksSection />
      <div className="border-border mt-10 border-t" />
      <DataSection />
    </div>
  );
}

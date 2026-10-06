import { useState } from "react";
import { ModelPicker } from "@/components/chat/model-picker";
import { Section, Setting } from "@/components/settings/controls";
import { Segmented } from "@/components/ui/segmented";
import { STYLE_MAX, type ExplainLevel } from "@/lib/explain-prefs";
import { useUiStore } from "@/stores/ui-store";

/** How the agent answers: how technical, any standing instruction, and
 * which model. */
export function AnswersSection() {
  const prefs = useUiStore((s) => s.explainPrefs);
  const setPrefs = useUiStore((s) => s.setExplainPrefs);
  const chatModel = useUiStore((s) => s.chatModel);
  const setChatModel = useUiStore((s) => s.setChatModel);
  // Saved when you click away, not on every key.
  const [style, setStyle] = useState(prefs.style);

  return (
    <Section
      id="answers"
      title="AI answers"
      note="Applies to every chat, with any agent."
    >
      <Setting
        label="Skill level"
        hint="Beginner explains plainly and defines jargon. Expert skips the basics."
      >
        <Segmented<ExplainLevel>
          label="Skill level"
          value={prefs.level}
          onChange={(level) => setPrefs({ level })}
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "balanced", label: "Balanced" },
            { value: "expert", label: "Expert" },
          ]}
        />
      </Setting>

      <Setting
        stacked
        label="Answer style"
        hint="An instruction added to every chat, such as “be thorough”, “use short answers” or “reply in Hindi”."
      >
        <textarea
          value={style}
          onChange={(e) => setStyle(e.target.value.slice(0, STYLE_MAX))}
          onBlur={() => setPrefs({ style })}
          rows={3}
          placeholder="Nothing extra"
          aria-label="Answer style"
          className="bg-muted placeholder:text-muted-foreground w-full resize-none rounded-xl px-4 py-3 text-[0.875rem] outline-none"
        />
        <div className="text-muted-foreground mt-1 text-right text-[0.6875rem] tabular-nums">
          {style.length} / {STYLE_MAX}
        </div>
      </Setting>

      <Setting
        label="Default model"
        hint={
          chatModel
            ? "Used for new chats, and picked from the list of models you can use. Choose an effort under a model to set that too."
            : "Auto: Yomu picks a model you can use. Choose one to always start with it."
        }
      >
        <div className="flex items-center gap-2">
          <ModelPicker />
          {chatModel && (
            <button
              type="button"
              onClick={() => setChatModel(null)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-md text-[0.75rem] underline underline-offset-2 outline-none focus-visible:ring-2"
            >
              Use Auto
            </button>
          )}
        </div>
      </Setting>
    </Section>
  );
}

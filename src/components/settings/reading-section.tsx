import { FontPicker } from "@/components/settings/font-picker";
import { Section, Setting, Switch } from "@/components/settings/controls";
import { ThemePicker } from "@/components/settings/theme-picker";
import { useUiStore } from "@/stores/ui-store";

/** Theme, typeface, and whether remote images load. */
export function ReadingSection() {
  const blockImages = useUiStore((s) => s.blockRemoteImages);
  const setBlockImages = useUiStore((s) => s.setBlockRemoteImages);

  return (
    <Section id="reading" title="Appearance and reading">
      <Setting label="Theme">
        <ThemePicker />
      </Setting>
      <Setting label="Typeface">
        <FontPicker />
      </Setting>

      {/* Set with the same variables as an article, so it changes as you
          choose. */}
      <div
        aria-hidden
        className="bg-muted rounded-2xl px-6 py-5"
        style={{
          fontFamily: "var(--reader-font)",
          fontSize: "var(--reader-size)",
          lineHeight: "var(--reader-leading)",
        }}
      >
        <p className="max-w-[var(--reader-measure)]">
          The quick brown fox jumps over the lazy dog. A good article reads
          without effort: the type is easy on the eye, the lines are the right
          length, and nothing gets in the way of the words.
        </p>
      </div>

      <Setting label="Block remote images">
        <Switch
          checked={blockImages}
          onChange={setBlockImages}
          label="Block remote images"
        />
      </Setting>
    </Section>
  );
}

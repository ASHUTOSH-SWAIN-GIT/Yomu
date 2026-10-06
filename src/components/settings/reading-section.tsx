import { FontPicker } from "@/components/settings/font-picker";
import { Section, Setting, Switch } from "@/components/settings/controls";
import { ThemePicker } from "@/components/settings/theme-picker";
import { useUiStore } from "@/stores/ui-store";

/** Theme, typeface, and whether remote images load. */
export function ReadingSection() {
  const blockImages = useUiStore((s) => s.blockRemoteImages);
  const setBlockImages = useUiStore((s) => s.setBlockRemoteImages);

  return (
    <Section
      id="reading"
      title="Appearance and reading"
      note="Applied everywhere, straight away."
    >
      <Setting
        label="Theme"
        hint="Popular editor themes, or Auto to follow your Mac's light or dark mode."
      >
        <ThemePicker />
      </Setting>
      <Setting label="Typeface" hint="How article text is set.">
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

      <Setting
        label="Block remote images"
        hint="Images are not fetched from the web, which stops sites from seeing you read. Images already saved on this computer still show."
      >
        <Switch
          checked={blockImages}
          onChange={setBlockImages}
          label="Block remote images"
        />
      </Setting>
    </Section>
  );
}

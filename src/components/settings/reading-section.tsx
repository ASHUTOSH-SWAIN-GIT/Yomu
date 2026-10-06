import { Segmented } from "@/components/ui/segmented";
import { Section, Setting, Switch } from "@/components/settings/controls";
import { ThemePicker } from "@/components/settings/theme-picker";
import { useUiStore } from "@/stores/ui-store";

/** Theme, how articles are set, and whether remote images load. */
export function ReadingSection() {
  const reader = useUiStore((s) => s.reader);
  const setReader = useUiStore((s) => s.setReader);
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
        <Segmented
          label="Typeface"
          value={reader.font}
          onChange={(font) => setReader({ font })}
          options={[
            { value: "sans", label: "Sans" },
            {
              value: "serif",
              label: (
                <span style={{ fontFamily: "Georgia, serif" }}>Serif</span>
              ),
            },
          ]}
        />
      </Setting>
      <Setting label="Text size">
        <Segmented
          label="Text size"
          value={reader.size}
          onChange={(size) => setReader({ size })}
          options={[
            { value: "s", label: "S", ariaLabel: "Small" },
            { value: "m", label: "M", ariaLabel: "Medium" },
            { value: "l", label: "L", ariaLabel: "Large" },
            { value: "xl", label: "XL", ariaLabel: "Extra large" },
          ]}
        />
      </Setting>
      <Setting label="Column width" hint="How wide a line of text can get.">
        <Segmented
          label="Column width"
          value={reader.measure}
          onChange={(measure) => setReader({ measure })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "medium", label: "Medium" },
            { value: "wide", label: "Wide" },
          ]}
        />
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

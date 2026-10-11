import { Minus, Plus } from "lucide-react";
import { FontPicker } from "@/components/settings/font-picker";
import { IconButton } from "@/components/ui/icon-button";
import { Section, Setting, Switch } from "@/components/settings/controls";
import { ThemePicker } from "@/components/settings/theme-picker";
import { MOD } from "@/lib/platform";
import { ZOOM_STEPS, stepZoom } from "@/lib/zoom";
import { useUiStore } from "@/stores/ui-store";

/** Theme, typeface, zoom, and whether remote images load. */
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

      <Setting
        label="Zoom"
        hint={`Makes the whole app larger or smaller. ${MOD}+ and ${MOD}− work too.`}
      >
        <ZoomControl />
      </Setting>

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

function ZoomControl() {
  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  return (
    <div className="bg-muted flex items-center gap-1 rounded-lg p-0.5">
      <IconButton
        label="Zoom out"
        size="md"
        disabled={zoom <= ZOOM_STEPS[0]}
        onClick={() => setZoom(stepZoom(zoom, -1))}
      >
        <Minus aria-hidden />
      </IconButton>
      <button
        type="button"
        onClick={() => setZoom(1)}
        title="Reset to 100%"
        className="hover:text-foreground focus-visible:ring-ring/60 text-ui w-12 rounded-md text-center font-medium tabular-nums outline-none focus-visible:ring-2"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton
        label="Zoom in"
        size="md"
        disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => setZoom(stepZoom(zoom, 1))}
      >
        <Plus aria-hidden />
      </IconButton>
    </div>
  );
}

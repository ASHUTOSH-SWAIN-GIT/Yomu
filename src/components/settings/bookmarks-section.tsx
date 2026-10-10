import { Section, Setting, Switch } from "@/components/settings/controls";
import { useBookmarksStore } from "@/stores/bookmarks-store";

/** Pages bookmarked into a folder named Yomu, in Chrome, Brave or Helium,
 * are saved to the Inbox on their own. */
export function BookmarksSection() {
  const enabled = useBookmarksStore((s) => s.enabled);
  const setEnabled = useBookmarksStore((s) => s.setEnabled);

  return (
    <Section id="bookmarks" title="Bookmarks">
      <Setting
        label="Save bookmarked pages"
        hint="Bookmark a page into a folder named Yomu in Chrome, Brave or Helium, and it shows up in your Inbox the next time Yomu opens."
      >
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Save bookmarked pages"
        />
      </Setting>
    </Section>
  );
}

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Setting, Switch } from "@/components/settings/controls";
import { useBookmarksStore } from "@/stores/bookmarks-store";

/** Pages bookmarked into a folder named Yomu, in Chrome, Brave or Helium,
 * are saved to the Inbox on their own. */
export function BookmarksSection() {
  const enabled = useBookmarksStore((s) => s.enabled);
  const setEnabled = useBookmarksStore((s) => s.setEnabled);
  const browsers = useBookmarksStore((s) => s.browsers);
  const checking = useBookmarksStore((s) => s.checking);
  const lastChecked = useBookmarksStore((s) => s.lastChecked);
  const saved = useBookmarksStore((s) => s.saved);
  const waiting = useBookmarksStore((s) => s.waiting);
  const check = useBookmarksStore((s) => s.check);

  return (
    <Section id="bookmarks" title="Bookmarks">
      <Setting label="Save pages from a bookmarks folder named Yomu">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Save pages from a bookmarks folder named Yomu"
        />
      </Setting>
      {enabled && (
        <div className="text-muted-foreground flex flex-col gap-1 text-[0.8125rem]">
          {browsers.map((b) => (
            <span key={b.name}>
              {b.name}:{" "}
              {!b.found
                ? "not found"
                : b.hasFolder
                  ? "folder found"
                  : "no Yomu folder yet"}
            </span>
          ))}
          <span className="mt-1 flex items-center gap-3">
            {checking ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Checking…
              </>
            ) : (
              <>
                {lastChecked
                  ? `Checked ${new Date(lastChecked).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
                {saved > 0 && ` · ${saved} saved`}
                {waiting > 0 && ` · ${waiting} waiting`}
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={checking}
              onClick={() => void check()}
            >
              Check now
            </Button>
          </span>
        </div>
      )}
    </Section>
  );
}

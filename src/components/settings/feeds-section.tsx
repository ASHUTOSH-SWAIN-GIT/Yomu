import { SiteLogoTile } from "@/components/layout/article-cover";
import { Section } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import { unsubscribeSite } from "@/lib/article-actions";
import { useFeedsStore } from "@/stores/feeds-store";

/** The blogs subscribed to from an article's menu. New posts are saved to the
 * Inbox on their own. */
export function FeedsSection() {
  const feeds = useFeedsStore((s) => s.feeds);

  return (
    <Section id="feeds" title="Subscriptions">
      {feeds.length === 0 ? (
        <p className="text-muted-foreground text-meta">
          No subscriptions yet. Open an article and choose Subscribe for more
          blogs from its … menu.
        </p>
      ) : (
        feeds.map((feed) => {
          const site = feed.siteUrl ?? feed.feedUrl;
          const host = new URL(site).hostname.replace(/^www\./, "");
          // The blog's logo stands in for its name, which is kept for
          // hovering and screen readers.
          return (
            <div key={feed.id} className="flex items-center gap-3">
              <span title={feed.title} aria-label={feed.title} role="img">
                <SiteLogoTile url={site} site={host} />
              </span>
              <div className="text-muted-foreground text-meta min-w-0 flex-1 truncate">
                {host}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void unsubscribeSite(feed)}
              >
                Unsubscribe
              </Button>
            </div>
          );
        })
      )}
    </Section>
  );
}

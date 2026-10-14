import { useState } from "react";
import { SiteLogoTile } from "@/components/layout/article-cover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EVERY_MS } from "@/lib/feeds";
import { useFeedsStore, type Subscribing } from "@/stores/feeds-store";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** What subscribing to a blog did: looking for its feed, then how the posts
 * it publishes from now on arrive in the Inbox. Opened by
 * `subscribeSite`. */
export function SubscribeDialog() {
  const subscribing = useFeedsStore((s) => s.subscribing);
  const setSubscribing = useFeedsStore((s) => s.setSubscribing);
  const close = () => setSubscribing(null);
  if (!subscribing) return null;

  const s = subscribing;
  const site =
    s.status === "done" ? (s.feed.siteUrl ?? s.feed.feedUrl) : s.pageUrl;
  const host = hostOf(site);
  const minutes = Math.round(EVERY_MS / 60_000);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
        <div className="bg-muted relative -mx-1 -mt-1 overflow-hidden rounded-xl">
          <FeedArt state={s} />
          {/* The blog's own logo sits on the art's source circle. */}
          <SiteLogoTile
            key={site}
            url={site}
            site={host}
            className="absolute top-1/2 left-[16.67%] -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        <div className="mt-5" aria-live="polite">
          <DialogTitle className="text-title font-bold tracking-[-0.01em]">
            {s.status === "looking"
              ? "Looking for a feed…"
              : s.status === "failed"
                ? "Couldn't find a feed for this site"
                : s.existing
                  ? `Already subscribed to ${s.feed.title}`
                  : `Subscribed to ${s.feed.title}`}
          </DialogTitle>
          <p className="text-muted-foreground text-meta mt-0.5">{host}</p>

          <DialogDescription
            className={
              s.status === "done"
                ? "text-ui mt-4 font-medium"
                : "text-muted-foreground text-ui mt-4"
            }
          >
            {s.status === "looking"
              ? `Reading ${host} for an RSS or Atom feed. This takes a few seconds.`
              : s.status === "failed"
                ? `${host} doesn't publish an RSS or Atom feed Yomu can read, so there is nothing to subscribe to.`
                : s.existing
                  ? "Its new posts already arrive in your Inbox."
                  : "By subscribing, every new blog uploaded after this point will automatically show up in your Inbox."}
          </DialogDescription>

          {s.status === "done" && (
            <ul className="text-muted-foreground text-ui mt-2 list-disc space-y-1.5 pl-4">
              <li>
                Yomu checks when it opens and about every {minutes} minutes.
              </li>
              <li>
                To unsubscribe, use the article's … menu or Settings →
                Subscriptions.
              </li>
            </ul>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant={s.status === "done" ? "default" : "ghost"}
            className="rounded-lg"
            onClick={close}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// The art's geometry, in its 336 × 120 viewBox: the blog on the left sends
// posts down a dotted path into an Inbox tray on the right.
const ROUTE = "M104 60 C150 22 206 98 252 60";
/** Points a quarter, half and three quarters along ROUTE, for a still
 * picture when motion is reduced. */
const ALONG = [
  [140, 49],
  [178, 60],
  [216, 71],
];
const TRAY = "M258 58h12l4 8h16l4-8h12v18a4 4 0 0 1-4 4h-40a4 4 0 0 1-4-4z";

/** A post: a small page with ruled lines, the first in the theme's accent. */
function Post() {
  return (
    <g>
      <rect
        x={-8}
        y={-10}
        width={16}
        height={20}
        rx={3}
        fill="var(--card)"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.5}
        strokeWidth={1.25}
      />
      <path
        d="M-4.5-5h9"
        stroke="var(--honey)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M-4.5-1h9M-4.5 3h6"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.45}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </g>
  );
}

/** The dialog's picture, drawn from the theme's colours so it fits every
 * theme. While the feed is looked for, posts travel the path; once found,
 * a check drops onto the tray. */
function FeedArt({ state }: { state: Subscribing }) {
  const [still] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const failed = state.status === "failed";
  const done = state.status === "done";

  return (
    <svg
      viewBox="0 0 336 120"
      aria-hidden
      className="block h-auto w-full"
      fill="none"
    >
      {/* The blog, broadcasting. */}
      <circle
        cx={56}
        cy={60}
        r={26}
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth={1.5}
      />
      <g
        className={state.status === "looking" ? "feed-pulse" : undefined}
        stroke={failed ? "var(--muted-foreground)" : "var(--honey)"}
        strokeOpacity={failed ? 0.3 : 1}
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M83.85 40.5A34 34 0 0 1 83.85 79.5" />
        <path d="M92.04 34.74A44 44 0 0 1 92.04 85.26" opacity={0.5} />
      </g>

      <path
        d={ROUTE}
        stroke="var(--muted-foreground)"
        strokeOpacity={failed ? 0.15 : 0.4}
        strokeWidth={1.5}
        strokeDasharray="0.5 6"
        strokeLinecap="round"
      />

      {state.status === "looking" &&
        ALONG.map(([x, y], i) =>
          still ? (
            <g key={i} transform={`translate(${x} ${y})`}>
              <Post />
            </g>
          ) : (
            <g key={i} opacity={0}>
              <animateMotion
                path={ROUTE}
                dur="2.4s"
                begin={`${i * 0.8}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.15;0.8;1"
                dur="2.4s"
                begin={`${i * 0.8}s`}
                repeatCount="indefinite"
              />
              <Post />
            </g>
          ),
        )}

      {/* The Inbox. */}
      <ellipse
        cx={282}
        cy={86}
        rx={26}
        ry={2.5}
        fill="var(--foreground)"
        opacity={0.06}
      />
      <path
        d={TRAY}
        fill="var(--card)"
        stroke="var(--muted-foreground)"
        strokeOpacity={failed ? 0.35 : 0.7}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeDasharray={failed ? "3 3" : undefined}
      />

      {done && (
        <g className="drop-in">
          <circle cx={282} cy={44} r={9} fill="var(--honey)" />
          <path
            d="M278 44.2l2.8 2.8 5.2-5.6"
            stroke="var(--popover)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

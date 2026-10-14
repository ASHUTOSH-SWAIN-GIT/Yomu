import { create } from "zustand";
import { discoverFeed, readFeed } from "@/lib/commands";
import {
  addFeed,
  listFeedItemUrls,
  listFeeds,
  markFeedChecked,
  recordFeedItems,
  removeFeed,
} from "@/lib/db";
import {
  EVERY_MS,
  MIN_GAP_MS,
  PER_FEED_PASS,
  planImport,
  type Feed,
  type FeedEntry,
} from "@/lib/feeds";
import { saveToInbox } from "@/lib/inbox";
import { logError } from "@/lib/log";
import { useLibraryStore } from "@/stores/library-store";

/** What the subscribe dialog shows: the feed being looked for, then what
 * came of it. `pageUrl` is the article the reader subscribed from. */
export type Subscribing =
  | { status: "looking"; pageUrl: string }
  | { status: "failed"; pageUrl: string }
  | {
      status: "done";
      pageUrl: string;
      feed: Feed;
      existing: boolean;
    };

interface FeedsStore {
  /** The blogs the reader is subscribed to. */
  feeds: Feed[];
  checking: boolean;
  /** The subscribe dialog, or null when it is closed. */
  subscribing: Subscribing | null;
  setSubscribing: (s: Subscribing | null) => void;
  load: () => Promise<void>;
  /** Subscribes to the blog a page (or a feed URL) is on. Posts it already
   * has are only noted as seen; just the ones published from now on go to
   * the Inbox. Rejects when the site has no feed. */
  subscribe: (pageUrl: string) => Promise<{ feed: Feed; existing: boolean }>;
  /** Unsubscribes; the articles already saved stay. */
  unsubscribe: (id: string) => Promise<void>;
  /** Looks at the blogs not looked at lately and saves what is new. */
  check: () => Promise<void>;
}

/** Saves the newest unseen posts of a blog to the Inbox and notes every post
 * as seen, so none is offered twice. A post that cannot be fetched is noted
 * as dismissed and not tried again. Returns how many were saved. */
async function pull(
  feed: Feed,
  entries: FeedEntry[],
  limit: number,
): Promise<number> {
  const { take, skip } = planImport(
    entries,
    await listFeedItemUrls(feed.id),
    limit,
  );
  let added = 0;
  for (const entry of take) {
    try {
      if ((await saveToInbox(entry.url)).added) added += 1;
      await recordFeedItems(feed.id, [entry], false);
    } catch (err) {
      logError(`saving the post ${entry.url} of ${feed.title} failed`, err);
      await recordFeedItems(feed.id, [entry], true);
    }
  }
  await recordFeedItems(feed.id, skip, true);
  return added;
}

let running = false;

export const useFeedsStore = create<FeedsStore>((set, get) => ({
  feeds: [],
  checking: false,
  subscribing: null,
  setSubscribing: (subscribing) => set({ subscribing }),

  async load() {
    set({ feeds: await listFeeds() });
  },

  async subscribe(pageUrl) {
    const found = await discoverFeed(pageUrl);
    const known = get().feeds.find((f) => f.feedUrl === found.feedUrl);
    if (known) return { feed: known, existing: true };
    const feed = await addFeed(found);
    await recordFeedItems(feed.id, found.entries, true);
    await markFeedChecked(feed.id, Date.now());
    await get().load();
    return { feed, existing: false };
  },

  async unsubscribe(id) {
    await removeFeed(id);
    await get().load();
  },

  async check() {
    if (running) return;
    running = true;
    set({ checking: true });
    try {
      let added = 0;
      const due = get().feeds.filter(
        (f) =>
          f.lastChecked === null || Date.now() - f.lastChecked > MIN_GAP_MS,
      );
      for (const feed of due) {
        try {
          const found = await readFeed(feed.feedUrl);
          added += await pull(feed, found.entries, PER_FEED_PASS);
        } catch (err) {
          logError(`checking the feed of ${feed.title} failed`, err);
        }
        // Even a failed check waits its turn, so a dead blog is not asked
        // again every time the window is opened.
        await markFeedChecked(feed.id, Date.now()).catch((e) =>
          logError(`noting the check of ${feed.title} failed`, e),
        );
      }
      if (due.length > 0) await get().load();
      if (added > 0) await useLibraryStore.getState().refresh();
    } catch (err) {
      logError("checking the subscribed blogs failed", err);
    } finally {
      running = false;
      set({ checking: false });
    }
  },
}));

/** Checks now and every half hour, so a post published while Yomu is open
 * shows up in the Inbox, and one published while it was closed is there when
 * it opens. Returns how to stop. */
export function watchFeeds(): () => void {
  const check = () => void useFeedsStore.getState().check();
  void useFeedsStore
    .getState()
    .load()
    .then(check)
    .catch((err) => logError("loading the subscribed blogs failed", err));
  const timer = setInterval(check, EVERY_MS);
  return () => clearInterval(timer);
}

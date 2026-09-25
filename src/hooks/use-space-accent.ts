import { useEffect } from "react";
import { INBOX, slotOf, spaceOfArticle } from "@/lib/spaces";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSpacesStore } from "@/stores/spaces-store";

/**
 * Sets the page's one accent colour. It is the colour of the space you are
 * in: the open article's space, or the active space on the welcome page.
 * The Inbox (and anything unknown) uses the neutral slate. Colours live in
 * index.css as --sp-0..7; this only sets `data-space` on <html>.
 */
export function useSpaceAccent() {
  const active = useSpacesStore((s) => s.active);
  const slots = useSpacesStore((s) => s.slots);
  const reader = useReaderStore((s) => s.state);
  const articles = useLibraryStore((s) => s.articles);

  useEffect(() => {
    const openId = reader.status === "ready" ? reader.article.id : null;
    const summary = openId ? articles.find((a) => a.id === openId) : undefined;
    const spaceId = summary ? spaceOfArticle(summary, active) : active;
    const slot = spaceId === INBOX ? null : slotOf(spaceId, slots);

    const root = document.documentElement;
    if (slot === null) delete root.dataset.space;
    else root.dataset.space = String(slot);
  }, [active, slots, reader, articles]);
}

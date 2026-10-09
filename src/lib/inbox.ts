import { setInbox } from "@/lib/db";
import { useLibraryStore } from "@/stores/library-store";

/** Called when an article is opened: one that was waiting in the Inbox is
 * taken out of it. Does nothing for any other. */
export async function leaveInbox(articleId: string): Promise<void> {
  const waiting = useLibraryStore
    .getState()
    .articles.some((a) => a.id === articleId && a.inbox);
  if (!waiting) return;
  await setInbox(articleId, false);
  await useLibraryStore.getState().refresh();
}

import { logError } from "@/lib/log";
import { useReaderStore } from "@/stores/reader-store";
import { useTabsStore } from "@/stores/tabs-store";

/** Opens a link copied to the clipboard in a new tab. */
export async function openLinkFromClipboard() {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    await useTabsStore.getState().newTab();
    void useReaderStore.getState().openUrl(url.toString());
  } catch (err) {
    logError("open link from clipboard failed", err);
  }
}

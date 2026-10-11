import { open } from "@tauri-apps/plugin-dialog";
import { logError } from "@/lib/log";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";

/** Asks for a PDF on this computer and opens it as an article. */
export async function pickAndOpenPdf() {
  try {
    const path = await open({
      multiple: false,
      directory: false,
      title: "Open a PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof path === "string") openPdfOnPapersPage(path);
  } catch (err) {
    logError("choosing a PDF failed", err);
  }
}

/** Opens a PDF, with the Papers page showing while it is read. */
export function openPdfOnPapersPage(path: string) {
  useViewStore.getState().setPapersPage(true);
  void useReaderStore.getState().openPdf(path);
}

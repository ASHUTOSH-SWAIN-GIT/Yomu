import { open } from "@tauri-apps/plugin-dialog";
import { logError } from "@/lib/log";
import { usePaperImports } from "@/stores/paper-imports-store";
import { useReaderStore } from "@/stores/reader-store";
import { useViewStore } from "@/stores/view-store";

/** Asks for PDFs on this computer: one opens to read, several are added to
 * Papers. */
export async function pickAndOpenPdf() {
  try {
    const picked = await open({
      multiple: true,
      directory: false,
      title: "Open PDFs",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (picked) openPdfs(Array.isArray(picked) ? picked : [picked]);
  } catch (err) {
    logError("choosing a PDF failed", err);
  }
}

/** Opens one PDF to read; several are added to Papers in turn, and the
 * Papers page shows how far along each one is. Anything not a PDF is
 * skipped. */
export function openPdfs(paths: string[]) {
  const pdfs = paths.filter((p) => /\.pdf$/i.test(p));
  if (pdfs.length === 0) return;
  if (pdfs.length === 1) return openPdfOnPapersPage(pdfs[0]);
  useViewStore.getState().setPapersPage(true);
  if (useReaderStore.getState().state.status === "ready")
    useReaderStore.getState().reset();
  usePaperImports.getState().add(pdfs);
}

/** Opens a PDF, with the Papers page showing while it is read. */
export function openPdfOnPapersPage(path: string) {
  useViewStore.getState().setPapersPage(true);
  void useReaderStore.getState().openPdf(path);
}

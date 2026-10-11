//! Local PDF files. Yomu keeps its own copy of each imported paper, named by
//! the hash of its contents, so the same file imported twice is one paper and
//! the paper can be parsed again later (the parsing itself is in the
//! frontend, `src/lib/pdf/`, which needs the page drawing of pdf.js).

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

/// Larger files are refused: they would be read into memory whole.
const MAX_PDF_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PdfImport {
    /// SHA-256 of the file, in hex. The paper's identity.
    pub sha: String,
    /// The file's own name, for a title when the PDF has none.
    pub file_name: String,
    pub bytes: u64,
}

pub fn pdfs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not find the app data directory: {e}"))?
        .join("pdfs"))
}

pub fn file_for(dir: &Path, sha: &str) -> Result<PathBuf, String> {
    // The name comes from the frontend: only a hash can be a file here.
    if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("not a PDF id".into());
    }
    Ok(dir.join(format!("{}.pdf", sha.to_ascii_lowercase())))
}

/// Checks that `src` is a PDF, and copies it into `dir` (once).
pub fn import_in(src: &Path, dir: &Path) -> Result<PdfImport, String> {
    let meta = std::fs::metadata(src).map_err(|e| format!("could not open that file: {e}"))?;
    if !meta.is_file() {
        return Err("that is not a file".into());
    }
    if meta.len() > MAX_PDF_BYTES {
        return Err(format!(
            "that PDF is too large ({} MB; the limit is {} MB)",
            meta.len() / (1024 * 1024),
            MAX_PDF_BYTES / (1024 * 1024)
        ));
    }

    let mut file =
        std::fs::File::open(src).map_err(|e| format!("could not open that file: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut first = Vec::new();
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("could not read that file: {e}"))?;
        if n == 0 {
            break;
        }
        if first.len() < 1024 {
            first.extend_from_slice(&buf[..n.min(1024 - first.len())]);
        }
        hasher.update(&buf[..n]);
    }
    // The header may follow a few bytes of junk, but not far.
    if !first.windows(5).any(|w| w == b"%PDF-") {
        return Err("that file is not a PDF".into());
    }
    let sha = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();

    let target = file_for(dir, &sha)?;
    if !target.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("could not create the PDF folder: {e}"))?;
        // Written under another name first, so a copy cut short is never
        // taken for the paper.
        let partial = target.with_extension("part");
        let mut out =
            std::fs::File::create(&partial).map_err(|e| format!("could not save the PDF: {e}"))?;
        let mut again =
            std::fs::File::open(src).map_err(|e| format!("could not open that file: {e}"))?;
        std::io::copy(&mut again, &mut out).map_err(|e| format!("could not save the PDF: {e}"))?;
        out.flush()
            .map_err(|e| format!("could not save the PDF: {e}"))?;
        std::fs::rename(&partial, &target).map_err(|e| format!("could not save the PDF: {e}"))?;
    }

    Ok(PdfImport {
        sha,
        file_name: src
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        bytes: meta.len(),
    })
}

pub fn read_in(dir: &Path, sha: &str) -> Result<Vec<u8>, String> {
    std::fs::read(file_for(dir, sha)?).map_err(|e| format!("could not read the saved PDF: {e}"))
}

/// Removes saved PDFs whose id is not in `keep`; returns how many went.
pub fn prune_in(dir: &Path, keep: &[String]) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let is_pdf = path.extension().and_then(|e| e.to_str()) == Some("pdf");
        if is_pdf && !keep.iter().any(|k| k.eq_ignore_ascii_case(stem)) {
            removed += usize::from(std::fs::remove_file(&path).is_ok());
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yomu-pdf-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const PDF: &[u8] = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n";

    #[test]
    fn copies_a_pdf_once_and_names_it_by_its_hash() {
        let dir = temp("copy");
        let src = dir.join("paper.pdf");
        std::fs::write(&src, PDF).unwrap();
        let store = dir.join("store");

        let a = import_in(&src, &store).unwrap();
        let b = import_in(&src, &store).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.file_name, "paper.pdf");
        assert_eq!(a.bytes, PDF.len() as u64);
        assert_eq!(a.sha.len(), 64);
        assert_eq!(read_in(&store, &a.sha).unwrap(), PDF);
        assert_eq!(std::fs::read_dir(&store).unwrap().count(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_same_content_under_another_name_is_the_same_paper() {
        let dir = temp("same");
        let (one, two) = (dir.join("one.pdf"), dir.join("two.pdf"));
        std::fs::write(&one, PDF).unwrap();
        std::fs::write(&two, PDF).unwrap();
        let store = dir.join("store");
        assert_eq!(
            import_in(&one, &store).unwrap().sha,
            import_in(&two, &store).unwrap().sha
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_what_is_not_a_pdf() {
        let dir = temp("notpdf");
        let src = dir.join("notes.pdf");
        std::fs::write(&src, b"just some text, named like a pdf").unwrap();
        let err = import_in(&src, &dir.join("store")).unwrap_err();
        assert!(err.contains("not a PDF"), "{err}");
        assert!(import_in(&dir.join("missing.pdf"), &dir.join("store")).is_err());
        assert!(import_in(&dir, &dir.join("store")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_a_hash_can_name_a_saved_pdf() {
        let dir = temp("names");
        assert!(read_in(&dir, "../../etc/passwd").is_err());
        assert!(read_in(&dir, "abc").is_err());
        assert!(read_in(&dir, &"g".repeat(64)).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_the_pdfs_nothing_uses() {
        let dir = temp("prune");
        let store = dir.join("store");
        let keep = dir.join("keep.pdf");
        let drop = dir.join("drop.pdf");
        std::fs::write(&keep, PDF).unwrap();
        std::fs::write(&drop, [PDF, b"x"].concat()).unwrap();
        let kept = import_in(&keep, &store).unwrap();
        import_in(&drop, &store).unwrap();

        assert_eq!(prune_in(&store, std::slice::from_ref(&kept.sha)), 1);
        assert!(read_in(&store, &kept.sha).is_ok());
        assert_eq!(std::fs::read_dir(&store).unwrap().count(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

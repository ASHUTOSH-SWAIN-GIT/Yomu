/** A PDF in the library has no web address. Its `canonicalUrl` is
 * `pdf:<sha256 of the file>`, so the same file is one paper however many
 * times it is opened. */
const PREFIX = "pdf:";

export const pdfCanonicalUrl = (sha: string) => PREFIX + sha;
export const isPdfUrl = (canonicalUrl: string) =>
  canonicalUrl.startsWith(PREFIX);
export const pdfShaOf = (canonicalUrl: string) =>
  isPdfUrl(canonicalUrl) ? canonicalUrl.slice(PREFIX.length) : null;

/** `file:///Users/me/paper.pdf` for a path on this computer. */
export function fileUrl(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  return "file://" + (slashed.startsWith("/") ? "" : "/") + slashed;
}

/** The name of the file, from a path or a `file:` address. */
export function baseName(pathOrUrl: string): string {
  const name = pathOrUrl.replace(/\\/g, "/").split("/").pop() ?? "";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

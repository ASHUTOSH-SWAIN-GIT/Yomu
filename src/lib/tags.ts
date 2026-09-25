/** Tags are the storage behind spaces (see lib/spaces.ts): lowercase, words
 * joined by hyphens, at most 32 characters. Empty means "not a valid tag". */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}

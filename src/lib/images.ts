/** True for images that would be fetched from a remote host. Relative and
 * data: URLs never leave the machine, so they're never blocked. */
export function isRemoteImage(src: string): boolean {
  return /^(https?:)?\/\//i.test(src.trim());
}

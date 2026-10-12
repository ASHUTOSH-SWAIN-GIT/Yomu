/** Where to look for a page's logo, best first. A page's own icon wins, then
 * the standard files on its host, then the same files on its parent domains
 * (a subdomain such as `docs.example.com` rarely has an icon of its own, but
 * `example.com` does). Pure, so the order is easy to test. */

/** Hosts whose subdomains belong to unrelated people, so the parent's logo
 * would be the platform's rather than the site's. */
const SHARED_HOSTS = new Set([
  "github.io",
  "gitlab.io",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
  "surge.sh",
  "blogspot.com",
  "wordpress.com",
  "notion.site",
]);

/** `a.b.example.com` -> `b.example.com`, `example.com`. Stops before a bare
 * public suffix (`co.uk`) and never returns a shared hosting domain. */
export function parentHosts(host: string): string[] {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return []; // an IP address
  const labels = host.split(".");
  // `example.co.uk` has a two-part suffix, so its registrable name is 3 labels.
  const last = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const floor = last.length === 2 && second && second.length <= 3 ? 3 : 2;
  const parents: string[] = [];
  for (let n = labels.length - 1; n >= floor; n--) {
    const parent = labels.slice(labels.length - n).join(".");
    if (SHARED_HOSTS.has(parent)) break;
    parents.push(parent);
  }
  return parents;
}

export function logoCandidates(url: string, icon?: string | null): string[] {
  const sources: string[] = icon ? [icon] : [];
  try {
    const page = new URL(url);
    if (!/^https?:$/.test(page.protocol)) return sources;
    for (const host of [page.hostname, ...parentHosts(page.hostname)]) {
      const origin = `${page.protocol}//${host}`;
      sources.push(`${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`);
    }
  } catch {
    // Not a web address (the built-in tour): the caller shows an initial.
  }
  return sources;
}

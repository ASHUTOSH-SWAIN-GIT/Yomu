/** While a page or a file is being read: a bar that keeps sliding (the wait
 * has no known length, so it never claims a percentage) and what is being
 * read. */
export function Fetching({ url, detail }: { url: string; detail?: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL; show it as typed.
  }
  return (
    <div role="status" aria-live="polite" className="mt-4">
      <div className="bg-secondary relative h-[3px] w-full overflow-hidden rounded-full">
        <div className="bg-foreground absolute inset-y-0 left-0 w-1/3 animate-[yomu-slide_1.3s_cubic-bezier(0.4,0,0.2,1)_infinite] rounded-full" />
      </div>
      <p className="text-muted-foreground text-ui mt-2.5">
        {detail ? `${host}: ${detail}` : `Fetching ${host}…`}
      </p>
    </div>
  );
}

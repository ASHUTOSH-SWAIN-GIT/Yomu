/** Case-insensitive match where every word of the query must appear. */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function filterByQuery<T>(
  items: T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  return query.trim()
    ? items.filter((i) => matchesQuery(textOf(i), query))
    : items;
}

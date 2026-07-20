/**
 * Filters and ranks searchable labels while preserving source order for ties.
 * Exact matches must beat labels that merely contain the query (for example,
 * searching "PCS" shows "PCS" before "Pkt-25Pcs").
 */
export function rankSearchResults<T>(
  values: readonly T[],
  query: string,
  labelOf: (value: T) => string
): T[] {
  const q = normalize(query);
  if (!q) return [...values];

  return values
    .map((value, index) => {
      const label = normalize(labelOf(value));
      return { value, index, rank: matchRank(label, q) };
    })
    .filter(result => result.rank < Number.POSITIVE_INFINITY)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(result => result.value);
}

function matchRank(label: string, query: string): number {
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;

  // Treat punctuation/space-separated parts as words: "Bag-PCS" ranks ahead
  // of a label where the query occurs only in the middle of a word.
  const words = label.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some(word => word.startsWith(query))) return 2;
  if (label.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

function normalize(value: string): string {
  return String(value ?? '').trim().toLocaleLowerCase();
}

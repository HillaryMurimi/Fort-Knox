export type QueryValue = string | number | boolean | Date | undefined | null;

export function toQueryString(values: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  return search.toString();
}

import type { CatalogCard } from "@perq/shared";

/**
 * Postgres jsonb does not preserve object key order, so compare with keys
 * sorted recursively. Array order is kept (it is meaningful, e.g. milestones).
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * D10: true when the stored card already matches the incoming one, so the
 * seed script skips the write and leaves source_updated_at (and every
 * cached explanation keyed on it) alone.
 */
export function sameCatalogCard(stored: CatalogCard, incoming: CatalogCard): boolean {
  return stableStringify(stored) === stableStringify(incoming);
}

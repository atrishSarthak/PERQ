import { eq } from "drizzle-orm";
import { cards, db, rowToCatalogCard } from "@perq/db";
import type { CatalogCard } from "@perq/shared";

// The active catalogue, cached briefly in memory: it changes only when
// someone re-runs the seed, and every recommender request needs it.
const TTL_MS = 60_000;
let cache: { at: number; cards: CatalogCard[] } | null = null;

export async function loadCatalogue(): Promise<CatalogCard[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cards;
  const rows = await db.select().from(cards).where(eq(cards.status, "active"));
  const list = rows.map(rowToCatalogCard).sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), cards: list };
  return list;
}

/** cards_version for the explanation cache: the latest "terms checked" date. */
export function catalogueVersion(list: CatalogCard[]): string {
  return list.map((c) => c.sourceUpdatedAt).sort().at(-1) ?? "0";
}

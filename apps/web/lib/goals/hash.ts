import type { GoalCategory } from "@perq/scoring-engine";
import type { GoalEntities } from "./channels";

// Engineering Plan D3: per-category TTL, not a single flat value — movies/
// attractions shift same-day (showtimes/availability), electronics prices
// are more stable but not static. Tune further once real usage exists
// (tracked in TODOS.md).
const TTL_MS_BY_CATEGORY: Record<GoalCategory, number> = {
  movie: 5 * 60 * 60 * 1000, // 5h
  attraction: 5 * 60 * 60 * 1000, // 5h
  electronics: 24 * 60 * 60 * 1000, // 24h
};

export function ttlMsForCategory(category: GoalCategory): number {
  return TTL_MS_BY_CATEGORY[category];
}

function dateScope(today: Date): string {
  // YYYY-MM-DD, UTC — matches D8's UTC-calendar-day convention elsewhere
  // in this feature. A date-scoped key is what prevents a Friday search
  // from serving Tuesday's cached showtimes/availability.
  return today.toISOString().slice(0, 10);
}

/**
 * Engineering Plan D3: normalized, date-scoped search terms — e.g.
 * "movie:oppenheimer:bangalore:2026-08-16". Deterministic key sorting
 * mirrors computeProfileHash/computeSearchBucketKey (Feature 1's D6/D15) —
 * the same entity input always hashes to the same key regardless of
 * incidental casing/whitespace differences from how the model happened to
 * phrase an extracted entity.
 */
export function computeQueryKey(
  category: GoalCategory,
  entities: GoalEntities,
  today: Date = new Date()
): string {
  function norm(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase();
  }

  const parts =
    category === "movie"
      ? [category, norm(entities.movieName), norm(entities.city)]
      : category === "attraction"
        ? [category, norm(entities.attractionName), norm(entities.city)]
        : [category, norm(entities.productName)];

  return [...parts, dateScope(today)].join(":");
}

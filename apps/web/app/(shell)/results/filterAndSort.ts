import type { ResultsCard } from "./types";

export type SortMode = "best-match" | "lowest-fee" | "highest-rewards";

export type AnnualFeeBucket = "free" | "under1000" | "1000plus";

export interface ResultsFilters {
  networks: Set<string>;
  issuers: Set<string>;
  categories: Set<string>; // scoring-engine category keys (dining, travel, ...)
  annualFeeBuckets: Set<AnnualFeeBucket>;
  showHeldOnly: boolean;
}

export function emptyFilters(): ResultsFilters {
  return {
    networks: new Set(),
    issuers: new Set(),
    categories: new Set(),
    annualFeeBuckets: new Set(),
    showHeldOnly: false,
  };
}

export function annualFeeBucket(fee: number): AnnualFeeBucket {
  if (fee === 0) return "free";
  if (fee < 1000) return "under1000";
  return "1000plus";
}

/**
 * Perf-A: pure, in-memory filter over the single already-fetched card set —
 * never a new query. §10: filters and sort tabs "re-sort the same result
 * set; they aren't separate queries."
 */
export function filterCards(cardsList: ResultsCard[], filters: ResultsFilters): ResultsCard[] {
  return cardsList.filter((card) => {
    if (filters.networks.size > 0 && !filters.networks.has(card.network)) return false;
    if (filters.issuers.size > 0 && !filters.issuers.has(card.issuer)) return false;
    if (
      filters.annualFeeBuckets.size > 0 &&
      !filters.annualFeeBuckets.has(annualFeeBucket(card.annualFee))
    )
      return false;
    if (filters.showHeldOnly && card.arsenalStatus !== "held") return false;
    if (filters.categories.size > 0) {
      const matchesAnyCategory = [...filters.categories].some(
        (cat) => (card.rewardRates[cat] ?? 0) > 0
      );
      if (!matchesAnyCategory) return false;
    }
    return true;
  });
}

/**
 * All three sort tabs operate on the same set (only cards MIMIR actually
 * scored — i.e. eligible recommendations, per D1). best-match preserves
 * MIMIR's own authored rank; the other two are simple re-derivations of
 * already-stored fields, not new computation.
 */
export function sortCards(cardsList: ResultsCard[], mode: SortMode): ResultsCard[] {
  const withRecommendation = cardsList.filter((c) => c.recommendation !== undefined);
  const sorted = [...withRecommendation];

  switch (mode) {
    case "best-match":
      sorted.sort((a, b) => a.recommendation!.rank - b.recommendation!.rank);
      break;
    case "lowest-fee":
      sorted.sort((a, b) => a.annualFee - b.annualFee);
      break;
    case "highest-rewards":
      sorted.sort((a, b) => b.recommendation!.score - a.recommendation!.score);
      break;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown sort mode: ${String(_exhaustive)}`);
    }
  }

  return sorted;
}

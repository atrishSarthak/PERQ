import type { ScoredCardV2 } from "@perq/shared";

// Sort tabs and filters for the Cards tab (handoff §1.6 screen 4). Pure, so
// unit-tested; never touches the ₹ figures, only which cards show and in
// what order.

export type SortMode = "best" | "lowestFee" | "highestRewards";
export const SORT_LABELS: Record<SortMode, string> = {
  best: "Best for you",
  lowestFee: "Lowest fee",
  highestRewards: "Highest rewards",
};

export type FeeRange = "any" | "free" | "upto_1000" | "upto_5000";

export interface Filters {
  networks: string[]; // empty = all
  issuers: string[]; // empty = all
  feeRange: FeeRange;
  lifetimeFreeOnly: boolean;
  upiOnly: boolean;
}

export const EMPTY_FILTERS: Filters = { networks: [], issuers: [], feeRange: "any", lifetimeFreeOnly: false, upiOnly: false };

export function activeFilterCount(f: Filters): number {
  return (
    (f.networks.length ? 1 : 0) + (f.issuers.length ? 1 : 0) + (f.feeRange !== "any" ? 1 : 0) + (f.lifetimeFreeOnly ? 1 : 0) + (f.upiOnly ? 1 : 0)
  );
}

/** The fee the user actually pays from year 2 (incl. GST, after waiver). */
const feeOf = (c: ScoredCardV2) => c.fee.payable;

function passes(c: ScoredCardV2, f: Filters): boolean {
  if (f.networks.length && !c.networks.some((n) => f.networks.includes(n))) return false;
  if (f.issuers.length && !f.issuers.includes(c.issuer)) return false;
  if (f.lifetimeFreeOnly && !c.flags.lifetimeFree) return false;
  if (f.upiOnly && !c.flags.upi) return false;
  const yearlyFee = Math.max(c.fee.joiningFee, c.fee.annualFee);
  if (f.feeRange === "free" && yearlyFee > 0) return false;
  if (f.feeRange === "upto_1000" && yearlyFee > 1180) return false; // ₹1,000 + 18% GST
  if (f.feeRange === "upto_5000" && yearlyFee > 5900) return false; // ₹5,000 + 18% GST
  return true;
}

export function applyFiltersAndSort(cards: ScoredCardV2[], f: Filters, sort: SortMode): ScoredCardV2[] {
  const list = cards.filter((c) => passes(c, f));
  switch (sort) {
    case "best":
      return [...list].sort((a, b) => a.rank - b.rank);
    case "lowestFee":
      return [...list].sort((a, b) => feeOf(a) - feeOf(b) || a.fee.joiningFee - b.fee.joiningFee || a.rank - b.rank);
    case "highestRewards":
      return [...list].sort((a, b) => b.rewards - a.rewards || a.rank - b.rank);
  }
}

export function issuersOf(cards: ScoredCardV2[]): string[] {
  return [...new Set(cards.map((c) => c.issuer))].sort();
}

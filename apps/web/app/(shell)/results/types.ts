// Shared shape between the results Server Component (data fetch) and the
// client component (filter/sort/render) — Perf-A: fetched once, filtered
// and sorted entirely in-memory client-side afterward, never re-queried.
export interface ResultsCard {
  cardId: string;
  name: string;
  issuer: string;
  network: string;
  annualFee: number;
  joiningFee: number;
  rewardRates: Record<string, number>;
  loungeAccess: unknown;
  // Result card's "Fee Waiver" stat — grounded per-card text, e.g. "Spend
  // ₹1,00,000 in a year". Null when the card has no waiver condition.
  feeWaiverCondition: string | null;
  // Present only for cards MIMIR actually recommends (eligible, per D1) —
  // undefined for a card the user is browsing via filters that wasn't
  // eligible for their profile.
  recommendation:
    | {
        rank: number;
        score: number;
        explanation: string;
      }
    | undefined;
  // Arsenal state (§12) — 'held' | 'not_held' | undefined (never toggled yet)
  arsenalStatus: "held" | "not_held" | undefined;
  // D15: citation URLs a web-searched card's terms were extracted from —
  // undefined for a card from the curated DB fallback set (nothing to cite).
  sourceUrls?: string[] | null;
}

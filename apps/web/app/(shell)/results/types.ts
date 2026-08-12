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
}

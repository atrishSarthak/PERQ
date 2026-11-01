import type { PlanOutcome, PlanResult } from "@perq/shared";
import { daysBetween } from "../state";

// Statement purchase matching (Step 3 §8): after a statement is confirmed,
// a debit within ±5% of a planned price, within 30 days of the plan, at a
// matching merchant or category, is offered to the user as "did you buy
// this?". Nothing is linked until they say yes.

export const MATCH_CONFIG = { amountTolerancePct: 5, withinDays: 30 } as const;

export interface MatchablePlan {
  id: string;
  price: number;
  /** What the recommended way would have charged (after offers), also accepted. */
  effectivePrice: number | null;
  merchant: string | null;
  category: string;
  createdDay: string;
}

export interface MatchableTxn {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  direction: "debit" | "credit";
  kind: string;
  category: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Same shop: one normalised name contains the other (e.g. "kartly" in "kartlyinternetpvt"). */
export function sameMerchant(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = norm(a);
  const y = norm(b);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
}

const near = (amount: number, target: number | null) => target !== null && Math.abs(amount - target) <= (target * MATCH_CONFIG.amountTolerancePct) / 100;

/** The transaction that best looks like this plan's purchase, or null. Closest amount wins, then the earliest. */
export function matchPlanPurchase(plan: MatchablePlan, txns: MatchableTxn[]): MatchableTxn | null {
  const hits = txns.filter(
    (t) =>
      t.direction === "debit" &&
      t.kind === "purchase" &&
      t.date >= plan.createdDay &&
      daysBetween(plan.createdDay, t.date) <= MATCH_CONFIG.withinDays &&
      (near(t.amount, plan.price) || near(t.amount, plan.effectivePrice)) &&
      (sameMerchant(plan.merchant, t.merchant) || t.category === plan.category)
  );
  const gap = (t: MatchableTxn) => Math.min(Math.abs(t.amount - plan.price), plan.effectivePrice === null ? Infinity : Math.abs(t.amount - plan.effectivePrice));
  return hits.sort((a, b) => gap(a) - gap(b) || a.date.localeCompare(b.date))[0] ?? null;
}

/** How the purchase went against the plan, for the "Ember saved you ₹X" line. */
export function planOutcome(r: PlanResult, txn: { date: string; cardAccountId: string }): PlanOutcome {
  const rec = r.recommended;
  const usedRecommendedCard = rec.kind !== "upi" && rec.cardAccountId === txn.cardAccountId;
  const usedRecommendedDay = txn.date >= rec.purchaseDate;
  return {
    usedRecommendedCard,
    usedRecommendedDay,
    savedVsUpi: usedRecommendedCard && rec.savingVsUpi > 0 ? rec.savingVsUpi : null,
    extraInterestFreeDays:
      usedRecommendedCard && usedRecommendedDay && r.timing && r.timing.extraDays > 0 && r.timing.cardAccountId === txn.cardAccountId ? r.timing.extraDays : null,
  };
}

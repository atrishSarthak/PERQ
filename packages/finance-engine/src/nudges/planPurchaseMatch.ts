import { formatDay } from "../format";
import type { NudgeCandidate } from "./types";
import { inr } from "./util";

// "Looks like you bought the iPhone on 16 Nov. Mark this plan as done?"
// (Step 3 §8). In-app only: never pushed, not counted against the daily cap.

export const PLAN_PURCHASE_MATCH_DESCRIPTION =
  "A purchase on your new statement looks like one you planned with Ember: about the same amount, within 30 days, at the same shop or in the same category.";

export const matchDedupeKey = (planId: string, transactionId: string) => `plan_purchase_match:${planId}:${transactionId}`;
/** The plan and transaction ids in a plan_purchase_match dedupe key. */
export function matchFromDedupeKey(key: string): { planId: string; transactionId: string } | null {
  const [rule, planId, transactionId] = key.split(":");
  return rule === "plan_purchase_match" && planId && transactionId ? { planId, transactionId } : null;
}

export function planPurchaseMatchCandidate(m: {
  planId: string;
  itemName: string;
  transaction: { id: string; date: string; merchant: string; amount: number; cardAccountId: string };
  cardLabel: string;
  expiresAt: string;
}): NudgeCandidate {
  const t = m.transaction;
  return {
    ruleId: "plan_purchase_match",
    dedupeKey: matchDedupeKey(m.planId, t.id),
    priority: 30,
    cardAccountId: t.cardAccountId,
    payload: { planId: m.planId, transactionId: t.id, itemName: m.itemName, amount: t.amount, date: t.date, merchant: t.merchant, cardLabel: m.cardLabel },
    expiresAt: m.expiresAt,
    templateTitle: `Did you buy the ${m.itemName}?`,
    templateBody: `Looks like you bought the ${m.itemName} on ${formatDay(t.date)}: ${inr(t.amount)} at ${t.merchant} on your ${m.cardLabel}. Mark this plan as done?`,
    why: PLAN_PURCHASE_MATCH_DESCRIPTION,
  };
}

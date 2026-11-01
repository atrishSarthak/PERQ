import { rewardCategoryOf } from "../state";
import type { PlanCardTerms } from "./types";

// Rewards on one purchase (§5.3): the catalogue's % value back for the
// category, limited by what's left of the card's monthly caps after this
// month's spend on it. Spend converted to EMI earns nothing unless the card
// says it does (cards.emi_rewards, default false).
//
// Assumption: caps are per statement cycle at most banks; the planner uses
// the IST calendar month's spend on the card as the closest thing it has.

export interface RewardOutcome {
  reward: number; // ₹, rounded down
  ratePct: number;
  capped: boolean;
  /** Spend converted to EMI and the card gives no rewards on EMI. */
  lostToEmi: boolean;
  /** What paying in full would have earned (for rewardsLost). */
  fullPaymentReward: number;
}

function rateOf(terms: PlanCardTerms, cat: string): number {
  return Math.max(0, terms.rewardRates[cat as keyof PlanCardTerms["rewardRates"]] ?? 0);
}

export function rewardFor(
  terms: PlanCardTerms,
  category: string,
  amount: number,
  opts: { emi?: boolean; monthSpendByCategory?: Partial<Record<string, number>> } = {}
): RewardOutcome {
  const rc = rewardCategoryOf(category);
  if (!rc) return { reward: 0, ratePct: 0, capped: false, lostToEmi: false, fullPaymentReward: 0 };
  const rate = rateOf(terms, rc);
  const raw = (Math.max(0, amount) * rate) / 100;
  const spent = opts.monthSpendByCategory ?? {};
  const earned = (cats: string[]) => cats.reduce((s, c) => s + ((spent[c] ?? 0) * rateOf(terms, c)) / 100, 0);

  let room = Infinity;
  const own = terms.rewardCaps[rc];
  if (own !== null && own !== undefined) room = Math.min(room, own - earned([rc]));
  for (const g of terms.capGroups) if (g.categories.includes(rc)) room = Math.min(room, g.monthlyCap - earned(g.categories));
  const total = terms.rewardCaps.total;
  if (total !== null && total !== undefined) room = Math.min(room, total - earned(Object.keys(spent)));
  room = Math.max(0, room);

  const full = Math.floor(Math.min(raw, room));
  const lostToEmi = !!opts.emi && !terms.emiRewards && full > 0;
  return {
    reward: lostToEmi ? 0 : full,
    ratePct: rate,
    capped: raw > room,
    lostToEmi,
    fullPaymentReward: full,
  };
}

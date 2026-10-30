import { CATEGORIES, type Category, type FinanceCard, type MonthlySpend } from "./types";

// Assumptions (handoff §0.5: document every one):
// 1. Money is integer rupees in every RETURNED total. Intermediate values
//    stay unrounded; each public function rounds once, at the end.
// 2. Indian card fees attract 18% GST. Fees shown to users and subtracted
//    from value include it, so ₹/yr is what actually leaves the account.
// 3. Reward rates are % value back already converted from points with the
//    card's redemption value (cards.reward_rates); this module never
//    re-applies a point value.
// 4. Caps limit the ₹ reward earned per month, in three layers: a category's
//    own cap, then any cap group it shares with other categories, then the
//    card-wide `total`. A shared cap scales its categories down in proportion.
// 5. Year 1 = joining fee + welcome benefit (no renewal fee yet). Ongoing =
//    renewal fee after waiver, no joining fee, no welcome benefit.
// 6. The renewal waiver is judged on projected annual spend (monthly × 12),
//    minus categories the card excludes from the waiver.
// 7. Milestones count when projected annual spend (all categories) reaches
//    the threshold.
// 8. Negative spend is treated as 0.

export const GST_RATE = 0.18;

export interface CategoryReward {
  category: Category;
  monthlySpend: number; // ₹/month, as given
  ratePct: number; // % value back
  uncappedMonthly: number; // spend × rate, before caps (unrounded)
  monthlyCap: number | null; // category cap, ₹/month
  capApplied: boolean; // true if a category or total cap reduced this line
  monthlyReward: number; // after caps (unrounded)
  annualReward: number; // monthlyReward × 12, rounded ₹
}

function nonNegative(n: number | undefined): number {
  return n && n > 0 ? n : 0;
}

function withGst(fee: number): number {
  return fee * (1 + GST_RATE);
}

export function annualSpend(spend: MonthlySpend, exclude: readonly Category[] = []): number {
  return CATEGORIES.filter((c) => !exclude.includes(c)).reduce(
    (sum, c) => sum + nonNegative(spend[c]) * 12,
    0
  );
}

/**
 * Per-category monthly rewards with caps applied. Line amounts stay
 * unrounded (callers sum them); `annualReward` per line is rounded for
 * display in the breakdown.
 */
export function monthlyRewardsByCategory(spend: MonthlySpend, card: FinanceCard): CategoryReward[] {
  const lines = CATEGORIES.map((category) => {
    const monthlySpend = nonNegative(spend[category]);
    const ratePct = nonNegative(card.rewardRates[category]);
    const uncappedMonthly = (monthlySpend * ratePct) / 100;
    const cap = card.rewardCaps[category];
    const monthlyCap = cap === null || cap === undefined ? null : cap;
    const capped = monthlyCap === null ? uncappedMonthly : Math.min(uncappedMonthly, monthlyCap);
    return {
      category,
      monthlySpend,
      ratePct,
      uncappedMonthly,
      monthlyCap,
      capApplied: capped < uncappedMonthly,
      monthlyReward: capped,
      annualReward: 0,
    };
  });

  const applySharedCap = (group: CategoryReward[], cap: number | null | undefined) => {
    if (cap === null || cap === undefined) return;
    const sum = group.reduce((s, l) => s + l.monthlyReward, 0);
    if (sum <= cap) return;
    const scale = cap / sum;
    for (const l of group) {
      if (l.monthlyReward > 0) {
        l.monthlyReward *= scale;
        l.capApplied = true;
      }
    }
  };
  for (const g of card.capGroups ?? []) {
    applySharedCap(
      lines.filter((l) => g.categories.includes(l.category)),
      g.monthlyCap
    );
  }
  applySharedCap(lines, card.rewardCaps.total);

  for (const l of lines) l.annualReward = Math.round(l.monthlyReward * 12);
  return lines;
}

export interface AnnualRewards {
  fromCategories: number; // ₹/yr from spend, after caps
  milestones: number; // ₹/yr of milestone benefits reached
  total: number;
}

// Unrounded annual rewards, shared so each public function rounds once.
function rawAnnualRewards(spend: MonthlySpend, card: FinanceCard) {
  const monthly = monthlyRewardsByCategory(spend, card).reduce((s, l) => s + l.monthlyReward, 0);
  const yearlySpend = annualSpend(spend);
  const milestones = (card.milestones ?? [])
    .filter((m) => yearlySpend >= m.annualSpend)
    .reduce((s, m) => s + m.value, 0);
  return { fromCategories: monthly * 12, milestones };
}

export function annualRewards(spend: MonthlySpend, card: FinanceCard): AnnualRewards {
  const { fromCategories, milestones } = rawAnnualRewards(spend, card);
  return {
    fromCategories: Math.round(fromCategories),
    milestones: Math.round(milestones),
    total: Math.round(fromCategories + milestones),
  };
}

export interface FeeAfterWaiver {
  annualFee: number; // renewal fee incl. GST, before any waiver
  waiverSpend: number | null; // threshold, ₹/yr
  qualifyingSpend: number; // projected annual spend that counts toward it
  waived: boolean;
  payable: number; // ₹ incl. GST, after waiver
}

export function annualFeeAfterWaiver(spend: MonthlySpend, card: FinanceCard): FeeAfterWaiver {
  const qualifyingSpend = annualSpend(spend, card.waiverExcludes ?? []);
  const fee = withGst(nonNegative(card.annualFee));
  const waived =
    fee > 0 && card.feeWaiverSpend !== null && qualifyingSpend >= card.feeWaiverSpend;
  return {
    annualFee: Math.round(fee),
    waiverSpend: card.feeWaiverSpend,
    qualifyingSpend: Math.round(qualifyingSpend),
    waived,
    payable: waived ? 0 : Math.round(fee),
  };
}

export interface NetAnnualValue {
  year: 1 | "ongoing";
  rewards: number; // spend rewards + milestones
  fee: number; // ₹ incl. GST: joining fee (year 1) or renewal fee after waiver (ongoing)
  welcomeBenefit: number; // year 1 only
  net: number; // rewards − fee + welcomeBenefit
}

export function netAnnualValue(
  spend: MonthlySpend,
  card: FinanceCard,
  opts: { year: 1 | "ongoing" }
): NetAnnualValue {
  const raw = rawAnnualRewards(spend, card);
  const rewards = raw.fromCategories + raw.milestones;

  if (opts.year === 1) {
    const fee = withGst(nonNegative(card.joiningFee));
    const welcome = nonNegative(card.welcomeBenefitValue);
    return {
      year: 1,
      rewards: Math.round(rewards),
      fee: Math.round(fee),
      welcomeBenefit: Math.round(welcome),
      net: Math.round(rewards - fee + welcome),
    };
  }

  // Use the unrounded fee so `net` is rounded exactly once.
  const qualifying = annualSpend(spend, card.waiverExcludes ?? []);
  const rawFee = withGst(nonNegative(card.annualFee));
  const fee =
    rawFee > 0 && card.feeWaiverSpend !== null && qualifying >= card.feeWaiverSpend ? 0 : rawFee;
  return {
    year: "ongoing",
    rewards: Math.round(rewards),
    fee: Math.round(fee),
    welcomeBenefit: 0,
    net: Math.round(rewards - fee),
  };
}

export interface Leakage {
  amount: number; // ₹/yr, ≥ 0
  bestEligibleId: string | null;
  bestEligibleValue: number;
  bestHeldId: string | null;
  bestHeldValue: number; // 0 when the user holds no card
  holdsBest: boolean; // the user already holds the best eligible card (or an equal one)
}

/**
 * What the user's current cards leave on the table per year: best eligible
 * card's ongoing net value minus the best held card's (handoff §0.5). A
 * single best card is compared, not a split across held cards. With no held
 * cards the baseline is ₹0 (spending without a card earns nothing).
 */
export function leakage(
  spend: MonthlySpend,
  heldCards: FinanceCard[],
  eligibleCards: FinanceCard[]
): Leakage {
  const best = (cards: FinanceCard[]) =>
    cards
      .map((c) => ({ id: c.id, value: netAnnualValue(spend, c, { year: "ongoing" }).net }))
      .sort((a, b) => b.value - a.value)[0] ?? null;

  const eligible = best(eligibleCards);
  const held = best(heldCards);
  const bestEligibleValue = eligible?.value ?? 0;
  // A held card that costs more than it earns can simply be closed, so the
  // baseline never drops below ₹0.
  const bestHeldValue = held ? Math.max(held.value, 0) : 0;
  const amount = Math.max(0, bestEligibleValue - bestHeldValue);
  return {
    amount,
    bestEligibleId: eligible?.id ?? null,
    bestEligibleValue,
    bestHeldId: held?.id ?? null,
    bestHeldValue,
    holdsBest: held !== null && amount === 0,
  };
}

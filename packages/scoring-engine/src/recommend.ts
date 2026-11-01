import {
  annualFeeAfterWaiver,
  annualRewards,
  CATEGORIES,
  formatInr,
  GST_RATE,
  leakage as computeLeakage,
  monthlyRewardsByCategory,
  netAnnualValue,
  type Category,
  type FinanceCard,
  type MonthlySpend,
} from "@perq/finance-engine";
import {
  AVG_TRIP_SPEND,
  CATEGORY_LABELS,
  FEE_TOLERANCE_MAX,
  INCOME_BUCKET_RUPEES,
  SPEND_BUCKET_RUPEES,
  TRAVEL_BUCKET_TRIPS,
  TXN_TO_RECOMMENDER,
  travelMonthlySpend,
  type CatalogCard,
  type TxnCategory,
  type Priority,
  type QuizAnswersV2,
  type RecommendationResult,
  type ScoredCardV2,
} from "@perq/shared";

// Card Recommender v2 (handoff §1.3). Deterministic: every ₹ comes from
// packages/finance-engine. Priorities only nudge ORDER (±10% of the score)
// and never change a ₹ figure shown to the user.

export const PRIORITY_BOOST_MAX = 0.1;

/** ₹/month per finance category, from the quiz buckets (documented in packages/shared). */
export function answersToMonthlySpend(answers: QuizAnswersV2): MonthlySpend {
  const s = answers.monthlySpend;
  return {
    food_delivery: SPEND_BUCKET_RUPEES[s.food_delivery],
    online_shopping: SPEND_BUCKET_RUPEES[s.online_shopping],
    groceries: SPEND_BUCKET_RUPEES[s.groceries],
    dining: SPEND_BUCKET_RUPEES[s.dining],
    fuel: SPEND_BUCKET_RUPEES[s.fuel],
    bills: SPEND_BUCKET_RUPEES[s.bills],
    upi: SPEND_BUCKET_RUPEES[s.upi],
    travel: travelMonthlySpend(answers.travelPerYear),
    other: 0, // not asked in the quiz; never guessed
  };
}

export function toFinanceCard(card: CatalogCard): FinanceCard {
  const rewardRates = Object.fromEntries(
    CATEGORIES.map((c) => [c, card.rewardRates[c] ?? 0])
  ) as Record<Category, number>;
  return {
    id: card.id,
    joiningFee: card.joiningFee,
    annualFee: card.annualFee,
    rewardRates,
    rewardCaps: card.rewardCaps,
    capGroups: card.capGroups,
    feeWaiverSpend: card.feeWaiverSpend,
    waiverExcludes: card.waiverExcludes,
    welcomeBenefitValue: card.welcomeBenefitValue,
    milestones: card.milestones,
  };
}

export interface Eligibility {
  eligible: boolean;
  reason: string;
}

/**
 * Who can get the card (handoff §1.3 step 1). Rules beyond what banks
 * publish are documented in docs/DECISIONS.md:
 * - Students and anyone under ₹25k/month see only secured or lifetime-free
 *   cards (a paid unsecured card usually needs a steady higher income).
 * - Secured cards need `openToSecured`, except for students (always shown).
 * - Fee tolerance compares the higher of joining and renewal fee (before GST).
 * Age isn't asked; the quiz assumes an adult applicant.
 */
export function checkEligibility(card: CatalogCard, answers: QuizAnswersV2): Eligibility {
  const income = INCOME_BUCKET_RUPEES[answers.monthlyIncome].floor;
  const lowIncomeOrStudent = answers.occupation === "student" || answers.monthlyIncome === "below_25k";
  const secured = card.cardType === "secured";
  const fee = Math.max(card.joiningFee, card.annualFee);
  const maxFee = FEE_TOLERANCE_MAX[answers.feeTolerance];

  if (secured && answers.occupation !== "student" && answers.openToSecured !== true) {
    return { eligible: false, reason: "Needs a fixed deposit, and you'd rather not open one." };
  }
  if (card.eligibleOccupations && !card.eligibleOccupations.includes(answers.occupation)) {
    return {
      eligible: false,
      reason: `${card.issuer} offers this card to ${card.eligibleOccupations.map(occupationLabel).join(" or ")} applicants.`,
    };
  }
  if (!secured && lowIncomeOrStudent && !card.lifetimeFree) {
    return {
      eligible: false,
      reason: "Paid cards without a deposit usually need a regular income above ₹25,000 a month.",
    };
  }
  if (card.minMonthlyIncome !== null && income < card.minMonthlyIncome) {
    return {
      eligible: false,
      reason: `Needs a take-home income of at least ${formatInr(card.minMonthlyIncome)} a month.`,
    };
  }
  if (maxFee !== null && fee > maxFee) {
    return {
      eligible: false,
      reason:
        maxFee === 0
          ? `Has a fee of ${formatInr(fee)} a year, and you asked for ₹0 only.`
          : `Its ${formatInr(fee)} fee is above your ${formatInr(maxFee)} limit.`,
    };
  }
  if (secured) {
    return {
      eligible: true,
      reason: card.fdMinAmount
        ? `Backed by a fixed deposit from ${formatInr(card.fdMinAmount)}, so no income proof is needed.`
        : "Backed by a fixed deposit, so no income proof is needed.",
    };
  }
  return { eligible: true, reason: eligibleReason(answers) };
}

function occupationLabel(o: string): string {
  return o === "self_employed" ? "self-employed" : o;
}

function eligibleReason(answers: QuizAnswersV2): string {
  const occ = occupationLabel(answers.occupation);
  return `Open to ${occ} applicants at your income.`;
}

// Priority → categories it favours. "cashback" favours cards that pay plain
// cashback (no points to redeem).
const PRIORITY_CATEGORIES: Record<Exclude<Priority, "cashback">, Category[]> = {
  travel: ["travel"],
  dining: ["dining", "food_delivery"],
  shopping: ["online_shopping"],
  fuel: ["fuel"],
};

/** 0..1: how well the card's rewards line up with the user's stated priorities. */
export function priorityMatch(card: CatalogCard, perCategory: Record<Category, number>, priorities: Priority[]): number {
  if (priorities.length === 0) return 0;
  const total = CATEGORIES.reduce((s, c) => s + perCategory[c], 0);
  const scores = priorities.map((p) => {
    if (p === "cashback") return card.redemptionValue === null || card.redemptionValue === 1 ? 1 : 0;
    if (total <= 0) return 0;
    return PRIORITY_CATEGORIES[p].reduce((s, c) => s + perCategory[c], 0) / total;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// "Food delivery" → "food delivery", but "UPI scan-and-pay" keeps its acronym.
function lowerFirst(label: string): string {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function oneLineReason(card: CatalogCard, lines: ScoredCardV2["breakdown"], fee: ScoredCardV2["fee"]): string {
  const top = [...lines].sort((a, b) => b.annualReward - a.annualReward)[0];
  const parts: string[] = [];
  if (top && top.annualReward > 0) {
    parts.push(`${top.ratePct}% back on ${lowerFirst(top.label)} (${formatInr(top.annualReward)}/yr)`);
  } else {
    parts.push("Little reward on your current spending");
  }
  if (card.lifetimeFree) parts.push("no fee, ever");
  else if (fee.waived) parts.push("your spend clears the fee waiver");
  else if (fee.payable > 0) parts.push(`${formatInr(fee.payable)} fee`);
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface RecommendOptions {
  /** Card ids the user holds (from the arsenal; falls back to answers.cardsHeld). */
  heldCardIds?: string[];
  /** Real spend from statements (handoff Step 2 §9), replacing the quiz buckets. */
  spendOverride?: { spend: MonthlySpend; statementCount: number; dataThrough: string | null };
}

/**
 * Average monthly spend by transaction category (finance-engine
 * averageMonthlySpend) → the recommender's categories via TXN_TO_RECOMMENDER.
 * Rent, EMI, fees, cash and transfers don't earn rewards and are left out.
 */
export function statementSpendToMonthly(perMonth: Record<string, number>): MonthlySpend {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as MonthlySpend;
  for (const [txnCat, v] of Object.entries(perMonth)) {
    const cat = TXN_TO_RECOMMENDER[txnCat as TxnCategory];
    if (cat && cat in out) out[cat as Category] += Math.round(v);
  }
  return out;
}

/**
 * Scores the catalogue for one user. Unverified cards are left out of
 * ranking entirely (handoff §1.2); they never appear in `ranked`.
 */
export function recommend(
  answers: QuizAnswersV2,
  catalogue: CatalogCard[],
  opts: RecommendOptions = {}
): RecommendationResult {
  const spend = opts.spendOverride?.spend ?? answersToMonthlySpend(answers);
  const held = new Set(opts.heldCardIds ?? answers.cardsHeld);
  const verified = catalogue.filter((c) => c.verified);

  const scored: (ScoredCardV2 & { score: number })[] = [];
  const ineligible: RecommendationResult["ineligible"] = [];

  for (const card of verified) {
    const eligibility = checkEligibility(card, answers);
    if (!eligibility.eligible) {
      ineligible.push({ cardId: card.id, name: card.name, issuer: card.issuer, reason: eligibility.reason });
      continue;
    }
    const fc = toFinanceCard(card);
    const lines = monthlyRewardsByCategory(spend, fc);
    const rewards = annualRewards(spend, fc);
    const ongoing = netAnnualValue(spend, fc, { year: "ongoing" });
    const year1 = netAnnualValue(spend, fc, { year: 1 });
    const fee = annualFeeAfterWaiver(spend, fc);

    const breakdown = lines.map((l) => ({
      category: l.category,
      label: CATEGORY_LABELS[l.category],
      monthlySpend: Math.round(l.monthlySpend),
      ratePct: l.ratePct,
      monthlyCap: l.monthlyCap,
      capApplied: l.capApplied,
      annualReward: l.annualReward,
    }));
    const feeLine = {
      joiningFee: Math.round(card.joiningFee * (1 + GST_RATE)),
      annualFee: fee.annualFee,
      waiverSpend: fee.waiverSpend,
      qualifyingSpend: fee.qualifyingSpend,
      waived: fee.waived,
      payable: fee.payable,
    };
    const perCategory = Object.fromEntries(lines.map((l) => [l.category, l.monthlyReward])) as Record<Category, number>;
    const match = priorityMatch(card, perCategory, answers.priorities);
    // Score = ongoing ₹ value nudged by at most ±10% toward stated priorities.
    const score = ongoing.net + PRIORITY_BOOST_MAX * Math.abs(ongoing.net) * match;

    scored.push({
      rank: 0,
      score,
      cardId: card.id,
      name: card.name,
      issuer: card.issuer,
      networks: card.networks,
      ongoingValue: ongoing.net,
      year1Value: year1.net,
      rewards: rewards.total,
      milestoneValue: rewards.milestones,
      welcomeBenefit: year1.welcomeBenefit,
      breakdown,
      fee: feeLine,
      eligibilityReason: eligibility.reason,
      flags: {
        upi: card.upiEnabled,
        lifetimeFree: card.lifetimeFree,
        fdBacked: card.cardType === "secured",
        held: held.has(card.id),
      },
      reason: oneLineReason(card, breakdown, feeLine),
      rewardNotes: card.rewardNotes,
      sourceUrl: card.sourceUrl,
      sourceUpdatedAt: card.sourceUpdatedAt,
      fdMinAmount: card.fdMinAmount,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.ongoingValue - a.ongoingValue || a.name.localeCompare(b.name));
  const ranked = scored.map(({ score: _score, ...rest }, i) => ({ ...rest, rank: i + 1 }));

  // Leakage (§1.3 step 4): best eligible card vs the best card already held.
  const byId = new Map(verified.map((c) => [c.id, c]));
  const heldCards = [...held].map((id) => byId.get(id)).filter((c): c is CatalogCard => !!c);
  const eligibleIds = new Set(ranked.map((r) => r.cardId));
  const leak = computeLeakage(
    spend,
    heldCards.map(toFinanceCard),
    verified.filter((c) => eligibleIds.has(c.id)).map(toFinanceCard)
  );
  const bestName = leak.bestEligibleId ? byId.get(leak.bestEligibleId)?.name : null;
  const hasCards = held.size > 0;
  const message = !leak.bestEligibleId
    ? "None of the cards we've verified fit your answers yet."
    : !hasCards
      ? `With no card yet, ${bestName} would add about ${formatInr(leak.amount)} a year.`
      : leak.holdsBest
        ? "You already hold the best card for how you spend."
        : `Your current cards leave about ${formatInr(leak.amount)} a year on the table.`;

  const checkedOn = verified.map((c) => c.sourceUpdatedAt).sort().at(-1) ?? "";

  return {
    ranked,
    ineligible,
    leakage: {
      amount: leak.amount,
      bestCardId: leak.bestEligibleId,
      bestHeldCardId: leak.bestHeldId,
      holdsBest: leak.holdsBest,
      hasCards,
      message,
    },
    assumptions: {
      monthlySpend: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(spend[c])])) as Record<Category, number>,
      travelTripsPerYear: TRAVEL_BUCKET_TRIPS[answers.travelPerYear],
      avgTripSpend: AVG_TRIP_SPEND,
      gstRatePct: GST_RATE * 100,
      spendSource: opts.spendOverride ? "statements" : "quiz",
      ...(opts.spendOverride ? { statementCount: opts.spendOverride.statementCount, dataThrough: opts.spendOverride.dataThrough } : {}),
    },
    catalogue: { total: catalogue.length, verified: verified.length, checkedOn },
  };
}

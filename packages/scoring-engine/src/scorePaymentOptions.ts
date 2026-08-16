import type {
  ArsenalCard,
  ChannelResult,
  FinancialContext,
  GoalCategory,
  PaymentOptionScore,
  SpendCategory,
} from "./types";

/**
 * Engineering Plan D1: the deterministic comparison/recommendation core.
 * Gemini never does this arithmetic — it receives this pre-computed
 * breakdown via a read-only tool and only picks the final framing and
 * writes the "why," grounded strictly in these numbers.
 *
 * No dedicated "movies"/"attractions"/"electronics" category exists in
 * cards.rewardRates (PRD's locked 8-category shape, Feature 1 §5) — this is
 * a first-pass mapping onto the closest existing category, same spirit as
 * buildProfileFromAnswers' dining/food-delivery rollup. Movies map to
 * 'general' (no closer fit); attractions to 'travel' (Klook/GetYourGuide
 * are travel-booking channels); electronics to 'ecommerce' (Amazon/
 * Flipkart). Revisit if/when the card database grows a dedicated category.
 */
const CATEGORY_TO_REWARD_CATEGORY: Record<GoalCategory, SpendCategory> = {
  movie: "general",
  attraction: "travel",
  electronics: "ecommerce",
};

// A card whose post-purchase utilization would cross this ratio gets a
// deterministic friction penalty below — the "informed friend" wouldn't
// recommend maxing out a card for a marginally better reward rate, even
// though nothing here literally forbids it. Not the same threshold as any
// bank's own utilization guidance; a plain, documented, testable constant
// (same discipline as scoreCards' PRIORITY_BOOST_MULTIPLIER).
const UTILIZATION_WARNING_THRESHOLD = 0.7;
// A flat 5% friction cost applied to adjustedCost (not effectiveCost) once
// the threshold is crossed — enough to flip a close call toward a lower-
// utilization option, without being so large it overrides a genuinely
// large reward-value gap.
const UTILIZATION_PENALTY_RATE = 0.05;

// If the user's statement closes within this many days, MIMIR notes that
// waiting maximizes interest-free float (PRD §9's "wait 3 days" example).
// Beyond this window, waiting isn't a meaningfully different recommendation
// from buying now, so no note is generated.
const FLOAT_ADVICE_WINDOW_DAYS = 5;

function daysUntilNextOccurrence(dayOfMonth: number, today: Date): number {
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayDate = today.getDate();

  let target = new Date(year, month, dayOfMonth);
  if (dayOfMonth <= todayDate) {
    target = new Date(year, month + 1, dayOfMonth);
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function computeBillingCycleNote(
  financialContext: FinancialContext,
  today: Date
): string | null {
  const { statementDate } = financialContext;
  if (statementDate == null) return null;

  const daysUntilClose = daysUntilNextOccurrence(statementDate, today);
  if (daysUntilClose <= 0 || daysUntilClose > FLOAT_ADVICE_WINDOW_DAYS) return null;

  return daysUntilClose === 1
    ? "wait 1 day — your statement closes then, maximizing your interest-free float"
    : `wait ${daysUntilClose} days — your statement closes then, maximizing your interest-free float`;
}

function computeUtilization(
  financialContext: FinancialContext,
  price: number
): { warning: boolean; penalty: number } {
  const { outstandingBalance, creditLimit } = financialContext;
  // Missing fields → no penalty, no crash (Engineering Plan edge case:
  // "financial-context fields not yet filled in — scorePaymentOptions
  // skips billing-cycle reasoning for missing fields rather than crashing").
  if (outstandingBalance == null || creditLimit == null || creditLimit <= 0) {
    return { warning: false, penalty: 0 };
  }

  const ratio = (outstandingBalance + price) / creditLimit;
  if (ratio <= UTILIZATION_WARNING_THRESHOLD) return { warning: false, penalty: 0 };

  return { warning: true, penalty: price * UTILIZATION_PENALTY_RATE };
}

/**
 * For every {channel result} × {arsenal card} pair (plus a "no card"
 * baseline per channel, so an empty arsenal still resolves), computes a
 * deterministic score. Ranked ascending by adjustedCost — lowest wins.
 * Reward value already means the cheapest RAW price isn't always the
 * winner; the utilization penalty means a close call can tip toward a
 * lower-utilization option even when its raw effective cost is marginally
 * higher — both are required, testable ways the winner can differ from
 * "just the numerically cheapest raw price" (PRD §2's stated goal).
 *
 * billingCycleNote is advisory only — it does not change adjustedCost or
 * the ranking, since it's a "when to buy" note, not a "which card" factor;
 * attached to every option (the caller surfaces it for whichever option is
 * ultimately recommended).
 *
 * `today` is injected (not read from `new Date()` internally) so this stays
 * pure and deterministically testable, same reasoning as runGeminiAgent's
 * injected `callModel`.
 */
export function scorePaymentOptions(
  channelResults: ChannelResult[],
  arsenalCards: ArsenalCard[],
  category: GoalCategory,
  financialContext: FinancialContext,
  today: Date = new Date()
): PaymentOptionScore[] {
  const rewardCategory = CATEGORY_TO_REWARD_CATEGORY[category];
  const billingCycleNote = computeBillingCycleNote(financialContext, today);

  const options: PaymentOptionScore[] = [];

  for (const result of channelResults) {
    const { warning, penalty } = computeUtilization(financialContext, result.price);

    // "No card" baseline — always present, so an empty arsenal still
    // resolves to a channel-only recommendation (D1 edge case) rather than
    // an empty options array.
    options.push({
      channel: result.channel,
      price: result.price,
      cardId: null,
      cardName: null,
      rewardValue: 0,
      effectiveCost: result.price,
      utilizationWarning: false,
      billingCycleNote,
      adjustedCost: result.price,
    });

    for (const card of arsenalCards) {
      const rewardRate = card.rewardRates[rewardCategory] ?? 0;
      const rewardValue = result.price * rewardRate;
      const effectiveCost = result.price - rewardValue;

      options.push({
        channel: result.channel,
        price: result.price,
        cardId: card.id,
        cardName: card.name,
        rewardValue,
        effectiveCost,
        utilizationWarning: warning,
        billingCycleNote,
        adjustedCost: effectiveCost + penalty,
      });
    }
  }

  return options.sort((a, b) => a.adjustedCost - b.adjustedCost);
}

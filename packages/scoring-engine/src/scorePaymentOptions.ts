import type {
  ArsenalCard,
  FinancialContext,
  PaymentOptionScore,
  PurchaseOffer,
  SpendCategory,
} from "./types";

/**
 * The deterministic comparison/recommendation core. Gemini never does this
 * arithmetic — it receives this pre-computed breakdown via a read-only tool
 * and only picks the final framing and writes the "why," grounded strictly
 * in these numbers.
 *
 * v2: `category` is now one of the existing 8 SpendCategory values directly
 * (classified by understandGoal), not a bespoke 3-value GoalCategory mapped
 * onto SpendCategory through a lossy lookup table — one taxonomy, not two.
 */

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
// waiting maximizes interest-free float. Beyond this window, waiting isn't a
// meaningfully different recommendation from buying now, so no note is
// generated.
const FLOAT_ADVICE_WINDOW_DAYS = 5;

// Purchases at or above this ₹ threshold get an additional BNPL option
// alongside the card options. Below this, a normal card's billing-cycle
// float already absorbs most cash-flow concern within a single cycle; ₹15k+
// is roughly where BNPL/no-cost-EMI conversion becomes a genuinely relevant
// alternative rather than noise. A plain, tunable constant — not sourced
// from any real BNPL provider's own eligibility rules (PERQ has no such
// integration).
const BNPL_ELIGIBLE_THRESHOLD = 15000;

const GENERIC_BNPL_NOTE =
  "Buy Now Pay Later is a general option here too — you won't earn card rewards, but it keeps this off your card's utilization and credit limit.";

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
  // Missing fields → no penalty, no crash.
  if (outstandingBalance == null || creditLimit == null || creditLimit <= 0) {
    return { warning: false, penalty: 0 };
  }

  const ratio = (outstandingBalance + price) / creditLimit;
  if (ratio <= UTILIZATION_WARNING_THRESHOLD) return { warning: false, penalty: 0 };

  return { warning: true, penalty: price * UTILIZATION_PENALTY_RATE };
}

/**
 * For every {discovered offer} × {arsenal card} pair (plus a "no card"
 * baseline per offer, so an empty arsenal still resolves, and a "bnpl"
 * option for large purchases), computes a deterministic score. Ranked
 * ascending by adjustedCost — lowest wins. Reward value already means the
 * cheapest RAW price isn't always the winner; the utilization penalty means
 * a close call can tip toward a lower-utilization option even when its raw
 * effective cost is marginally higher — both are required, testable ways
 * the winner can differ from "just the numerically cheapest raw price."
 *
 * A BNPL option deliberately carries NO utilization penalty and NO reward
 * reduction (adjustedCost === price) — this is what lets BNPL beat a card
 * option: it only wins over a card when that card's utilization penalty
 * pushed its adjustedCost above the plain price, never by an arbitrary
 * bonus. Against the plain "no card" baseline (also adjustedCost === price,
 * since paying in full today carries no card penalty either — this model
 * has no ₹ way to value "deferred payment" beyond that), BNPL and "no card"
 * are genuinely cost-tied; BNPL is inserted first, so a stable sort resolves
 * that tie in its favor — a deliberate preference for the more proactive,
 * thought-through suggestion on a large purchase, not a fabricated cost
 * advantage. `citedBnplNote` is used verbatim when discovery found a real,
 * citation-backed BNPL-provider fact for this specific goal; otherwise a
 * generic, honestly-framed advisory sentence is used instead — never a
 * fabricated specific provider claim.
 *
 * billingCycleNote is advisory only — it does not change adjustedCost or
 * the ranking, since it's a "when to buy" note, not a "which option" factor;
 * attached to every card-backed option (the caller surfaces it for whichever
 * option is ultimately recommended).
 *
 * `today` is injected (not read from `new Date()` internally) so this stays
 * pure and deterministically testable, same reasoning as runGeminiAgent's
 * injected `callModel`.
 */
export function scorePaymentOptions(
  offers: PurchaseOffer[],
  arsenalCards: ArsenalCard[],
  category: SpendCategory,
  financialContext: FinancialContext,
  citedBnplNote: string | null,
  today: Date = new Date()
): PaymentOptionScore[] {
  const billingCycleNote = computeBillingCycleNote(financialContext, today);

  const options: PaymentOptionScore[] = [];

  for (const offer of offers) {
    const { warning, penalty } = computeUtilization(financialContext, offer.price);

    // BNPL is pushed BEFORE the "no card" baseline below (both share the
    // same adjustedCost === price, since neither earns a reward or carries
    // a card-utilization penalty — this scoring model has no ₹ way to
    // value "deferred payment" over "pay in full now" beyond that). On a
    // genuine tie, Array.prototype.sort is stable, so insertion order
    // decides the winner: BNPL, the more proactive, thought-through
    // suggestion for a large purchase, wins the tie over the generic
    // "pay some other way" baseline — never a fabricated cost advantage,
    // just a deliberate tie-break preference.
    if (offer.price >= BNPL_ELIGIBLE_THRESHOLD) {
      options.push({
        source: offer.source,
        sourceUrl: offer.sourceUrl ?? null,
        price: offer.price,
        cardId: null,
        cardName: null,
        paymentMethod: "bnpl",
        rewardValue: 0,
        effectiveCost: offer.price,
        utilizationWarning: false,
        billingCycleNote: null,
        bnplNote: citedBnplNote ?? GENERIC_BNPL_NOTE,
        adjustedCost: offer.price,
      });
    }

    // "No card" baseline — always present, so an empty arsenal still
    // resolves to a source-only recommendation rather than an empty
    // options array.
    options.push({
      source: offer.source,
      sourceUrl: offer.sourceUrl ?? null,
      price: offer.price,
      cardId: null,
      cardName: null,
      paymentMethod: "no_card",
      rewardValue: 0,
      effectiveCost: offer.price,
      utilizationWarning: false,
      billingCycleNote,
      bnplNote: null,
      adjustedCost: offer.price,
    });

    for (const card of arsenalCards) {
      const rewardRate = card.rewardRates[category] ?? 0;
      const rewardValue = offer.price * rewardRate;
      const effectiveCost = offer.price - rewardValue;

      options.push({
        source: offer.source,
        sourceUrl: offer.sourceUrl ?? null,
        price: offer.price,
        cardId: card.id,
        cardName: card.name,
        paymentMethod: "card",
        rewardValue,
        effectiveCost,
        utilizationWarning: warning,
        billingCycleNote,
        bnplNote: null,
        adjustedCost: effectiveCost + penalty,
      });
    }
  }

  return options.sort((a, b) => a.adjustedCost - b.adjustedCost);
}

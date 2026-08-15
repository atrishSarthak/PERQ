import type { ScoredCard } from "@perq/scoring-engine";

function topCategoryLabel(scored: ScoredCard): { category: string; amount: number } | null {
  const top = [...scored.breakdown].sort((a, b) => b.annualValue - a.annualValue)[0];
  if (!top || top.annualValue <= 0) return null;
  return { category: top.category, amount: roundEstimate(top.monthlySpend) };
}

function secondCategoryLabel(scored: ScoredCard): { category: string; amount: number } | null {
  const sorted = [...scored.breakdown].sort((a, b) => b.annualValue - a.annualValue);
  const second = sorted[1];
  if (!second || second.annualValue <= 0) return null;
  return { category: second.category, amount: roundEstimate(second.monthlySpend) };
}

// Every ₹/month figure in these sentences is an ESTIMATE derived from a
// quiz answer (e.g. "6+ flights/year" -> an assumed avg ₹ value per flight,
// see packages/scoring-engine/estimateSpendFromBucket.ts) — never a number
// the user actually typed in. Rounding to the nearest ₹100 (rather than
// showing raw figures like "₹5333") keeps that estimate nature visible in
// the number itself, instead of reading as a suspiciously precise fact
// MIMIR pulled from nowhere.
function roundEstimate(amount: number): number {
  return Math.round(amount / 100) * 100;
}

// Spend-category labels for MIMIR's sentence — only overridden where the raw
// scoring-engine key wouldn't read naturally in a sentence; "dining",
// "travel", "hotels", "fuel", "groceries" already do.
const CATEGORY_SPEND_LABELS: Partial<Record<string, string>> = {
  ecommerce: "online shopping",
  general: "everyday spending",
  utilities: "bills",
};

function spendLabel(category: string): string {
  return CATEGORY_SPEND_LABELS[category] ?? category;
}

// Deterministic per-card pick (same card always reads the same way, no
// flicker on re-render) rather than a single fixed sentence shape repeated
// for every card, which is what made this read as templated/AI-generated.
// FNV-1a, not a naive polynomial hash: card ids are short, similarly-
// shaped strings (issuer-slug), and a plain `hash*31+char` hash's low bits
// turned out badly skewed for them in practice — most ids collided into
// the same one or two buckets out of eight instead of spreading out.
function pick<T>(options: T[], seed: string): T {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return options[(hash >>> 0) % options.length]!;
}

/**
 * Grounded, template-generated explanation directly from the already-
 * computed score breakdown — no LLM call. Used two ways:
 *   1. D7: when Gemini fails or the free-tier quota is exhausted for the
 *      top-ranked card. explanation_source='fallback_template' in that case.
 *   2. By design, for every rank below #1 — only the top pick gets the
 *      richer, longer explanation (buildTopPickTemplateExplanation below,
 *      or Gemini's own trade-off writeup when available); ranks 2+ always
 *      use this shorter template, tracked separately as
 *      explanation_source='template' since Gemini was never attempted for
 *      them (not a failure to report).
 *
 * Always names a real card + a real underlying factor (Design System §5:
 * "never a bare score or a vague 'recommended for you'"), written as MIMIR
 * would actually say it — direct, personified, no em dashes, and not the
 * same "MIMIR recommends the X" sentence shape every single time. Every ₹
 * figure is explicitly framed as MIMIR's own estimate ("~₹X/month" or
 * "roughly ₹X/month"), never stated as if the user typed that exact number.
 */
export function buildTemplateExplanation(scored: ScoredCard, cardName: string): string {
  const top = topCategoryLabel(scored);
  const seed = scored.card.id || cardName;

  if (!top) {
    return pick(
      [
        `The ${cardName} is a solid all-rounder for your overall spend pattern.`,
        `Nothing in your spend screams one category, so MIMIR likes the ${cardName}'s broad rewards for your overall spend pattern.`,
        `MIMIR's take: the ${cardName} covers your overall spend pattern well without leaning on any one category.`,
      ],
      seed
    );
  }

  const category = spendLabel(top.category);
  const amount = top.amount;

  return pick(
    [
      `You're putting an estimated ~₹${amount}/month into ${category}. The ${cardName} rewards exactly that, so it's the obvious pick.`,
      `MIMIR ran the numbers: your ${category} spend, roughly ₹${amount}/month based on your answers, lines up perfectly with what the ${cardName} pays back on.`,
      `The ${cardName} earns its keep here. Your ${category} habit alone runs an estimated ~₹${amount}/month, right in its sweet spot.`,
      `Given you're spending an estimated ₹${amount}/month on ${category}, the ${cardName} is the one that actually pays you back for it.`,
      `MIMIR likes the ${cardName} for you. It rewards ${category} best, and that's roughly ₹${amount} of your monthly spend right there.`,
      `~₹${amount}/month on ${category} is real money, by MIMIR's estimate. The ${cardName} is built to hand a chunk of it back.`,
      `MIMIR's reading of your spend: ${category} is where the ${cardName} pulls its weight, worth an estimated ₹${amount} every month.`,
      `That ~₹${amount}/month you're estimated to spend on ${category}? The ${cardName} turns it into real rewards.`,
    ],
    seed
  );
}

/**
 * The MIMIR's-Top-Pick-specific explanation — deliberately longer than
 * buildTemplateExplanation's one-liner (the results page only asks this
 * much of the #1 card; ranks 2+ stay terse by design, see above). Used as
 * the D7 fallback for the top pick when Gemini fails/is quota-exhausted —
 * the same real, grounded score-breakdown data, just elaborated into 3
 * sentences: the primary reward driver, the runner-up category if there is
 * one (so the pick doesn't read as one-dimensional), and the fee/value
 * trade-off that makes it worth holding.
 */
export function buildTopPickTemplateExplanation(scored: ScoredCard, cardName: string): string {
  const seed = scored.card.id || cardName;
  const top = topCategoryLabel(scored);
  const second = secondCategoryLabel(scored);

  const sentences: string[] = [];

  if (top) {
    const category = spendLabel(top.category);
    const amount = top.amount;
    sentences.push(
      pick(
        [
          `The ${cardName} tops your list because your ${category} spend, an estimated ~₹${amount}/month based on your answers, lines up almost exactly with what it rewards best.`,
          `MIMIR put the ${cardName} at #1 for one clear reason: your ${category} habit, roughly ₹${amount}/month, is squarely in this card's sweet spot.`,
          `Here's why the ${cardName} wins: it pays you back hardest on ${category}, and that's an estimated ₹${amount} of your spend every month.`,
        ],
        seed
      )
    );
  } else {
    sentences.push(
      `The ${cardName} tops your list as a genuine all-rounder — nothing in your spend leans hard enough on one category to need a specialist card.`
    );
  }

  if (second) {
    const category2 = spendLabel(second.category);
    sentences.push(
      `It also holds up on ${category2} (~₹${second.amount}/month by MIMIR's estimate), so this isn't a one-trick pick.`
    );
  }

  const fee = scored.card.annualFee;
  if (fee === 0) {
    sentences.push("And it costs nothing to hold, so there's no downside to adding it.");
  } else if (scored.milestoneValue > 0) {
    const threshold = scored.card.milestoneBenefits[0]?.spendThreshold;
    sentences.push(
      threshold
        ? `Its ₹${fee.toLocaleString("en-IN")} annual fee is easily offset once you cross the ₹${threshold.toLocaleString("en-IN")} milestone spend it rewards.`
        : `Its ₹${fee.toLocaleString("en-IN")} annual fee is easily offset by the rewards above.`
    );
  } else {
    sentences.push(
      `At a ₹${fee.toLocaleString("en-IN")} annual fee, the rewards above already cover the cost several times over.`
    );
  }

  return sentences.join(" ");
}

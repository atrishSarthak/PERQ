import type { ScoredCard } from "@perq/scoring-engine";

function topCategoryLabel(scored: ScoredCard): { category: string; amount: number } | null {
  const top = [...scored.breakdown].sort((a, b) => b.annualValue - a.annualValue)[0];
  if (!top || top.annualValue <= 0) return null;
  return { category: top.category, amount: Math.round(top.monthlySpend) };
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
 *      richer Gemini trade-off explanation (cost guardrail, D9/Perf-B's
 *      spirit); ranks 2+ always use this template, tracked separately as
 *      explanation_source='template' since Gemini was never attempted for
 *      them (not a failure to report).
 *
 * Always names a real card + a real underlying factor (Design System §5:
 * "never a bare score or a vague 'recommended for you'"), written as MIMIR
 * would actually say it — direct, personified, no em dashes, and not the
 * same "MIMIR recommends the X" sentence shape every single time.
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
      `You're putting ₹${amount}/month into ${category}. The ${cardName} rewards exactly that, so it's the obvious pick.`,
      `MIMIR ran the numbers: your ${category} spend of ₹${amount}/month lines up perfectly with what the ${cardName} pays back on.`,
      `The ${cardName} earns its keep here. Your ${category} habit alone runs ₹${amount}/month, right in its sweet spot.`,
      `Given you're spending ₹${amount}/month on ${category}, the ${cardName} is the one that actually pays you back for it.`,
      `MIMIR likes the ${cardName} for you. It rewards ${category} best, and that's ₹${amount} of your monthly spend right there.`,
      `₹${amount}/month on ${category} is real money. The ${cardName} is built to hand a chunk of it back.`,
      `MIMIR's reading of your spend: ${category} is where the ${cardName} pulls its weight, worth ₹${amount} every month.`,
      `That ₹${amount}/month you're already spending on ${category}? The ${cardName} turns it into real rewards.`,
    ],
    seed
  );
}

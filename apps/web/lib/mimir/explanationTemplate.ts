import type { ScoredCard } from "@perq/scoring-engine";

function topCategoryLabel(scored: ScoredCard): { category: string; amount: number } | null {
  const top = [...scored.breakdown].sort((a, b) => b.annualValue - a.annualValue)[0];
  if (!top || top.annualValue <= 0) return null;
  return { category: top.category, amount: Math.round(top.monthlySpend) };
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
 * "never a bare score or a vague 'recommended for you'").
 */
export function buildTemplateExplanation(scored: ScoredCard, cardName: string): string {
  const top = topCategoryLabel(scored);
  if (!top) {
    return `MIMIR recommends the ${cardName} — it scores highest for your overall spend pattern.`;
  }
  return `MIMIR recommends the ${cardName} — it scores highest for your ${top.category} spend of ₹${top.amount}/month.`;
}

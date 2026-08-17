import type { PaymentOptionScore } from "@perq/scoring-engine";

function formatRupee(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * Grounded, template-generated explanation directly from
 * scorePaymentOptions' already-computed winner — no LLM call. Used when the
 * narration/explanation call fails, times out, or exceeds the tool-round cap
 * (distinct from the total-failure path, which covers "discovery found
 * nothing" — this covers "discovery/scoring succeeded but the explanation
 * step itself failed"). Same "never a bare score" discipline as Feature 1's
 * buildTopPickTemplateExplanation.
 */
export function buildGoalFallbackExplanation(winner: PaymentOptionScore): string {
  const sentences: string[] = [];

  if (winner.paymentMethod === "bnpl") {
    sentences.push(
      `MIMIR recommends buying from ${winner.source}, priced at ${formatRupee(winner.price)}, using Buy Now Pay Later instead of a card. ${winner.bnplNote ?? ""}`.trim()
    );
  } else if (winner.cardId && winner.cardName) {
    sentences.push(
      `MIMIR recommends buying from ${winner.source} using your ${winner.cardName}, priced at ${formatRupee(winner.price)} with an estimated ${formatRupee(winner.rewardValue)} back in rewards.`
    );
  } else {
    sentences.push(
      `MIMIR recommends buying from ${winner.source}, priced at ${formatRupee(winner.price)}. None of your cards clearly beat paying another way for this one.`
    );
  }

  if (winner.utilizationWarning) {
    sentences.push(
      "Heads up: using a card for this would push your utilization pretty high right now, so MIMIR weighed that in."
    );
  }

  if (winner.billingCycleNote) {
    sentences.push(`One more thing: ${winner.billingCycleNote}.`);
  }

  return sentences.join(" ");
}

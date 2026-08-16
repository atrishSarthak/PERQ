import type { PaymentOptionScore } from "@perq/scoring-engine";
import { CHANNEL_DISPLAY_NAME, type Channel } from "./channels";

function formatRupee(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * Engineering Plan D9: grounded, template-generated explanation directly
 * from scorePaymentOptions' already-computed winner — no LLM call. Used
 * when the narration/explanation call fails, times out, or exceeds the
 * tool-round cap (distinct from D9's total-failure path, which covers
 * "both channels failed" — this covers "channel data succeeded but the
 * explanation step itself failed"). Same "never a bare score" discipline
 * as Feature 1's buildTopPickTemplateExplanation, direct reuse of that
 * pattern rather than a fresh design.
 */
export function buildGoalFallbackExplanation(winner: PaymentOptionScore): string {
  const channelName = CHANNEL_DISPLAY_NAME[winner.channel as Channel] ?? winner.channel;

  const sentences: string[] = [];

  if (winner.cardId && winner.cardName) {
    sentences.push(
      `MIMIR recommends buying on ${channelName} using your ${winner.cardName}, priced at ${formatRupee(winner.price)} with an estimated ${formatRupee(winner.rewardValue)} back in rewards.`
    );
  } else {
    sentences.push(
      `MIMIR recommends buying on ${channelName}, priced at ${formatRupee(winner.price)}. None of your cards clearly beat paying another way for this one.`
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

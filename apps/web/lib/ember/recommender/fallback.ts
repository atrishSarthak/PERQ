import { formatInr } from "@perq/finance-engine";
import type { RecommendationResult } from "@perq/shared";

// The template explanation used when Gemini is down, over quota, capped
// out, or writes something ungrounded (handoff §0.4 fallback). Built only
// from recommend()'s numbers.

export function recommenderFallback(result: RecommendationResult): string {
  const [top, second, third] = result.ranked;
  if (!top) return "None of the cards PERQ has verified fit your answers yet. Try widening your fee limit in Profile.";

  const best = [...top.breakdown].sort((a, b) => b.annualReward - a.annualReward)[0];
  const parts = [
    `${top.name} is worth about ${formatInr(top.ongoingValue)} a year to you` +
      (best && best.annualReward > 0
        ? `, mostly from ${best.ratePct}% back on ${best.label.toLowerCase()} (${formatInr(best.annualReward)} a year).`
        : "."),
  ];
  if (top.flags.lifetimeFree) parts.push("It has no annual fee, ever.");
  else if (top.fee.waived) parts.push(`Its ${formatInr(top.fee.annualFee)} fee is waived because your spending clears ${formatInr(top.fee.waiverSpend ?? 0)} a year.`);
  else if (top.fee.payable > 0) parts.push(`That's after its ${formatInr(top.fee.payable)} yearly fee.`);
  if (top.flags.fdBacked && top.fdMinAmount) parts.push(`It needs a fixed deposit of at least ${formatInr(top.fdMinAmount)}.`);

  const lines = [second, third]
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => `• ${c.name}: about ${formatInr(c.ongoingValue)} a year.`);
  return [parts.join(" "), ...lines].join("\n");
}

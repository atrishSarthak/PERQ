import type { EmiSpec, EmiTrueCost } from "@perq/shared";
import { GST_RATE } from "../finance";
import { PLANNER_CONFIG } from "./config";

// The true cost of an EMI (§5.4), built to be reused unchanged by the
// Chrome extension endpoint: plain inputs, no state.
//
// - Regular EMI: reducing-balance interest over the tenure, with 18% GST on
//   the interest and on the processing fee.
// - No-cost EMI: the shop gives an upfront discount equal to the bank's
//   interest, so you pay the sticker price over the tenure. Net interest is
//   ~0, but GST on that interest and the processing fee (+ GST) are still
//   paid, and rewards may be lost. When the offer doesn't print the rate,
//   PLANNER_CONFIG.noCostAssumedRatePa is used and the result says so.
// - The limit blocked by the EMI isn't money, so it's reported, not charged.
//
// Each line rounds once; the extra cost is the sum of the rounded lines.

const r2 = (n: number) => Math.round(n);

/** Monthly instalment on a reducing-balance loan. */
export function emiInstalment(principal: number, ratePa: number, months: number): number {
  const r = ratePa / 12 / 100;
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

export function emiTrueCost(emi: EmiSpec, price: number, opts: { rewardsLost?: number } = {}): EmiTrueCost {
  const n = emi.tenureMonths;
  const rewardsLost = Math.max(0, opts.rewardsLost ?? 0);
  const fee = Math.max(0, emi.processingFee ?? 0) * (1 + GST_RATE);
  let instalment: number;
  let interest: number;
  let upfrontDiscount = 0;
  let principal = price;
  let assumedRatePa: number | null = null;

  if (emi.noCost) {
    const rate = emi.interestRatePa ?? PLANNER_CONFIG.noCostAssumedRatePa;
    if (emi.interestRatePa === undefined) assumedRatePa = rate;
    // You pay `price` in n instalments; the bank's principal is what those
    // instalments are worth at its rate, and the gap is the interest the
    // shop pays for you as a discount.
    instalment = price / n;
    const r = rate / 12 / 100;
    principal = r === 0 ? price : (instalment * (1 - (1 + r) ** -n)) / r;
    interest = price - principal;
    upfrontDiscount = interest;
  } else {
    instalment = emiInstalment(price, emi.interestRatePa ?? 0, n);
    interest = instalment * n - price;
  }
  const gst = interest * GST_RATE;

  const lines: { label: string; amount: number }[] = [];
  if (interest > 0) lines.push({ label: "Interest charged by the bank", amount: r2(interest) });
  if (upfrontDiscount > 0) lines.push({ label: "No-cost discount (cancels the interest)", amount: -r2(upfrontDiscount) });
  if (gst > 0) lines.push({ label: "GST on the interest (18%)", amount: r2(gst) });
  if (fee > 0) lines.push({ label: "Processing fee incl. GST", amount: r2(fee) });
  if (rewardsLost > 0) lines.push({ label: "Rewards you don't earn on EMI", amount: r2(rewardsLost) });

  return {
    tenureMonths: n,
    noCost: !!emi.noCost,
    monthlyInstalment: r2(instalment),
    totalInterest: r2(interest),
    upfrontDiscount: r2(upfrontDiscount),
    gstOnInterest: r2(gst),
    processingFeeWithGst: r2(fee),
    rewardsLost: r2(rewardsLost),
    // The sum of the itemised lines, so the breakdown always adds up.
    extraCostVsFullPayment: lines.reduce((s, l) => s + l.amount, 0),
    blockedLimit: r2(principal),
    assumedRatePa,
    lines,
  };
}

import type { PlanResult } from "@perq/shared";

/** What the model sees of a result: the answer and the numbers behind it, nothing to compute. */
export function compactResult(r: PlanResult) {
  const opt = (o: PlanResult["recommended"]) => ({
    cardAccountId: o.cardAccountId,
    label: o.label,
    kind: o.kind,
    purchaseDate: o.purchaseDate,
    netCost: o.netCost,
    savingVsUpi: o.savingVsUpi,
    offerDiscount: o.offerDiscount,
    rewards: o.rewards,
    extraCosts: o.extraCosts,
    interestFreeDays: o.interestFreeDays,
    dueOn: o.dueOn,
    utilisationAfterPct: o.utilisationAfterPct,
    ...(o.emi ? { emi: { tenureMonths: o.emi.tenureMonths, monthlyInstalment: o.emi.monthlyInstalment, extraCostVsFullPayment: o.emi.extraCostVsFullPayment } } : {}),
  });
  return {
    verdict: r.verdict,
    headline: r.headline,
    why: r.verdictReason,
    recommended: opt(r.recommended),
    ...(r.chosen ? { userPicked: { ...opt(r.chosen.option), costsMoreBy: r.chosen.extraCost } } : {}),
    otherOptions: r.options.filter((o) => o.id !== r.recommended.id).slice(0, 5).map(opt),
    budget: { leftToSpend: r.affordability.leftThisMonth, afterPurchase: r.affordability.afterPurchase, month: r.affordability.forMonth ?? r.asOf.slice(0, 7), goalImpacts: r.affordability.goalImpacts },
    timing: r.timing ?? null,
    credit: r.credit ?? null,
    emi: r.emi ? { tenureMonths: r.emi.tenureMonths, noCost: r.emi.noCost, monthlyInstalment: r.emi.monthlyInstalment, extraCostVsFullPayment: r.emi.extraCostVsFullPayment, lines: r.emi.lines } : null,
    goalProposal: r.goalProposal ?? null,
    missing: r.missingData.map((m) => m.text),
    asOf: r.asOf,
  };
}

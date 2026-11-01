import type { NudgeRule } from "./types";
import { endOfIstDay, inr, monthName, plusDays } from "./util";

/** Behind pace for the annual-fee waiver with ≤ 4 months left, or within 15% of it. */
export const feeWaiverPace: NudgeRule = {
  id: "fee_waiver_pace",
  description: "Your card waives its annual fee if you spend a set amount in a card year, and you're close or behind.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const f = c.feeWaiver;
      if (!f || f.remaining <= 0) return [];
      const behind = !f.onPace && f.monthsLeft <= config.feeWaiverMonthsLeft;
      const near = f.remaining <= f.threshold * config.feeWaiverNearPct;
      if (!behind && !near) return [];
      const lastDay = plusDays(f.cardYearEnds, -1);
      const byMonth = monthName(lastDay);
      return [
        {
          ruleId: "fee_waiver_pace",
          dedupeKey: `fee_waiver_pace:${c.cardAccountId}:${f.cardYearEnds}:${behind ? "behind" : "near"}`,
          priority: config.priorities.fee_waiver_pace,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, remaining: f.remaining, threshold: f.threshold, annualFee: f.annualFee, spent: f.spentThisCardYear, byMonth, monthsLeft: f.monthsLeft },
          expiresAt: endOfIstDay(lastDay),
          templateTitle: `${inr(f.remaining)} to waive the ${c.label} fee`,
          templateBody: `${inr(f.remaining)} more spend by ${byMonth} waives the ${inr(f.annualFee)} fee.`,
          why: `${c.label} waives its ${inr(f.annualFee)} fee at ${inr(f.threshold)} of spend in a card year. You've spent ${inr(f.spentThisCardYear)} this card year${f.startAssumed ? " (counting from your first uploaded statement)" : ""}, with ${f.monthsLeft} month${f.monthsLeft === 1 ? "" : "s"} left.`,
        },
      ];
    });
  },
};

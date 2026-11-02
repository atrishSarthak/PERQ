import type { NudgeCandidate, NudgeRule } from "./types";
import { istDate } from "../state";
import { endOfIstDay, inr, plusDays } from "./util";

/**
 * Step 4: ≥ 3 late-night (22:00–05:00 IST) food orders in 7 days, or delivery
 * and platform fees ≥ 25% of this month's food spend. In-app only: it's never
 * pushed (a late-night nudge would land in quiet hours anyway).
 */
export const swiggyPattern: NudgeRule = {
  id: "swiggy_pattern",
  description: "Three or more late-night Swiggy food orders in a week, or fees at a quarter or more of your food orders this month.",
  evaluate(state, { now, config }) {
    const s = state.swiggy;
    if (!s) return [];
    const budget = s.foodBudget && s.foodBudget.left >= 0 ? s.foodBudget : null;
    const budgetLine = budget ? ` ${inr(budget.left)} left in your food budget for ${state.month.daysLeft} days.` : "";
    const out: NudgeCandidate[] = [];
    const week = s.lateNightWeek;
    if (week.count >= config.swiggyLateNightMin && week.latestDay) {
      out.push({
        ruleId: "swiggy_pattern",
        dedupeKey: `swiggy_pattern:late_night:${week.latestDay}`,
        priority: config.priorities.swiggy_pattern,
        payload: {
          pattern: "late_night",
          count: week.count,
          amount: week.amount,
          foodBudgetLeft: budget?.left ?? null,
          daysLeft: state.month.daysLeft,
          month: s.month,
        },
        expiresAt: endOfIstDay(plusDays(istDate(now), 2)),
        templateTitle: "Late-night food orders",
        templateBody: `${week.count} late-night orders this week, ${inr(week.amount)}.${budgetLine}`,
        why: `Your Swiggy history shows ${week.count} food orders between 10 pm and 5 am in the last 7 days.`,
      });
    }
    if (s.foodSpend > 0 && s.fees >= s.foodSpend * config.swiggyFeeSharePct) {
      const pct = Math.round((s.fees / s.foodSpend) * 100);
      out.push({
        ruleId: "swiggy_pattern",
        dedupeKey: `swiggy_pattern:fees:${s.month}`,
        priority: config.priorities.swiggy_pattern,
        payload: { pattern: "fees", fees: s.fees, foodSpend: s.foodSpend, pct, month: s.month },
        expiresAt: endOfIstDay(`${s.month}-28`),
        templateTitle: "Swiggy fees add up",
        templateBody: `${inr(s.fees)} of your ${inr(s.foodSpend)} on Swiggy this month went on delivery and platform fees, ${pct}%.`,
        why: `Fees were ${pct}% of your Swiggy food spend this month.`,
      });
    }
    return out;
  },
};

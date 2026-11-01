import type { NudgeRule } from "./types";
import { endOfIstDay, inr } from "./util";

const LABELS: Record<string, string> = {
  food_delivery: "Food delivery", online_shopping: "Online shopping", groceries: "Groceries", dining: "Dining out", fuel: "Fuel",
  bills: "Bills", travel: "Travel", upi: "UPI", entertainment: "Entertainment", health: "Health", education: "Education", other: "Other",
};

/**
 * A category (or the total) is past 80% of its budget with more than 7 days
 * left. Statement data is a lower bound on the month, so this can fire on
 * partial coverage, but never claims more spend than the data shows.
 */
export const budgetPace: NudgeRule = {
  id: "budget_pace",
  description: "Spending in a budget is past 80% of its limit with more than a week of the month left.",
  evaluate(state, { config }) {
    const m = state.month;
    // Spend from a statement that didn't reconcile isn't trusted for a rupee nudge (§5.4).
    if (!m.budget || !m.allReconciled || m.daysLeft <= config.budgetPaceMinDaysLeft) return [];
    const out: { key: string; label: string; spent: number; limit: number }[] = [];
    for (const [cat, limit] of Object.entries(m.budget.categoryLimits)) {
      const spent = m.spendByCategory[cat] ?? 0;
      if (limit > 0 && spent > limit * config.budgetPacePct) out.push({ key: cat, label: LABELS[cat] ?? cat, spent, limit });
    }
    if (m.budget.totalLimit && m.totalSpend > m.budget.totalLimit * config.budgetPacePct) {
      out.push({ key: "total", label: "Total spending", spent: m.totalSpend, limit: m.budget.totalLimit });
    }
    return out.map((b) => ({
      ruleId: "budget_pace",
      dedupeKey: `budget_pace:${m.key}:${b.key}`,
      priority: config.priorities.budget_pace,
      payload: { label: b.label, spent: b.spent, limit: b.limit, daysLeft: m.daysLeft, month: m.key, dataThrough: state.dataThrough },
      expiresAt: endOfIstDay(`${m.key}-28`),
      templateTitle: `${b.label} near its budget`,
      templateBody: `${b.label} is at ${inr(b.spent)} of your ${inr(b.limit)} budget, with ${m.daysLeft} days left.`,
      why: `Your statements up to ${state.dataThrough ?? "now"} show ${inr(b.spent)} of ${b.label.toLowerCase()} this month against a ${inr(b.limit)} budget.`,
    }));
  },
};

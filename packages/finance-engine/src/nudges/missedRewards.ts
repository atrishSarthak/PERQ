import type { NudgeRule } from "./types";
import { endOfIstDay, inr, plusDays } from "./util";

const LABELS: Record<string, string> = {
  food_delivery: "food orders", online_shopping: "online shopping", groceries: "groceries", dining: "eating out",
  fuel: "fuel", bills: "bills", travel: "travel", upi: "UPI payments", entertainment: "entertainment", health: "health", education: "education", other: "everyday spends",
};

/** Using a better held card last cycle would have earned ≥ ₹100 more. Reconciled statements only. */
export const missedRewards: NudgeRule = {
  id: "missed_rewards",
  description: "Another card you hold earns more on some of what you bought last cycle.",
  evaluate(state, { config }) {
    const reconciled = new Set(state.cards.filter((c) => c.latestStatement?.reconciled).map((c) => c.cardAccountId));
    const items = state.missedRewardsLastCycle.items.filter((i) => reconciled.has(i.usedCardAccountId));
    const total = Math.round(items.reduce((s, i) => s + i.extra, 0));
    if (total < config.missedRewardsMin) return [];
    // Lead with the biggest (better card, category) group.
    const groups = new Map<string, { betterCard: string; category: string; extra: number; count: number }>();
    for (const i of items) {
      const k = `${i.betterCard}|${i.category}`;
      const g = groups.get(k) ?? { betterCard: i.betterCard, category: i.category, extra: 0, count: 0 };
      g.extra += i.extra;
      g.count += 1;
      groups.set(k, g);
    }
    const top = [...groups.values()].sort((a, b) => b.extra - a.extra)[0]!;
    const topExtra = Math.round(top.extra);
    const cycleKey = state.cards.map((c) => c.latestStatement?.date ?? "").sort().join(",");
    return [
      {
        ruleId: "missed_rewards",
        dedupeKey: `missed_rewards:${cycleKey}`,
        priority: config.priorities.missed_rewards,
        payload: { total, topExtra, betterCard: top.betterCard, categoryLabel: LABELS[top.category] ?? top.category, transactionCount: items.length },
        expiresAt: endOfIstDay(plusDays(state.asOf, 21)),
        templateTitle: `${inr(total)} more in rewards was possible`,
        templateBody:
          topExtra === total
            ? `Using your ${top.betterCard} for ${LABELS[top.category] ?? top.category} would have earned ${inr(total)} more last cycle.`
            : `Using your ${top.betterCard} for ${LABELS[top.category] ?? top.category} would have earned ${inr(topExtra)} more last cycle (${inr(total)} across all spends).`,
        why: `PERQ compared each purchase on your latest statements with the reward rate of every card you hold. ${items.length} purchase${items.length === 1 ? "" : "s"} would have earned ${inr(total)} more on a different card. Rates come from each card's published terms; caps aren't counted, so it's an estimate.`,
      },
    ];
  },
};

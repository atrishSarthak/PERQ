import type { NudgeRule } from "./types";
import { endOfIstDay, inr, shortDate } from "./util";

export const dueToday: NudgeRule = {
  id: "due_today",
  description: "A card bill is due today and you haven't marked it paid.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const s = c.latestStatement;
      if (!s?.dueDate || !s.totalDue || c.isPaidMarked || c.daysToDue !== 0) return [];
      // No rupee amount from a statement that didn't reconcile (§5.4).
      const amount = s.reconciled;
      return [
        {
          ruleId: "due_today",
          dedupeKey: `due_today:${c.cardAccountId}:${s.date}`,
          priority: config.priorities.due_today,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, totalDue: amount ? s.totalDue : null, minimumDue: amount ? s.minimumDue : null, dueDate: s.dueDate, statementDate: s.date },
          expiresAt: endOfIstDay(s.dueDate),
          templateTitle: `${c.label} bill due today`,
          templateBody: amount ? `Your ${c.label} bill (${inr(s.totalDue)}) is due today.` : `Your ${c.label} bill is due today. Check the amount on the statement itself.`,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} shows ${amount ? inr(s.totalDue) : "a bill"} due today, ${shortDate(s.dueDate)}.`,
        },
      ];
    });
  },
};

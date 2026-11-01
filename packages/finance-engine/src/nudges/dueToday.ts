import type { NudgeRule } from "./types";
import { endOfIstDay, inr, shortDate } from "./util";

export const dueToday: NudgeRule = {
  id: "due_today",
  description: "A card bill is due today and you haven't marked it paid.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const s = c.latestStatement;
      if (!s?.dueDate || !s.totalDue || c.isPaidMarked || c.daysToDue !== 0) return [];
      return [
        {
          ruleId: "due_today",
          dedupeKey: `due_today:${c.cardAccountId}:${s.date}`,
          priority: config.priorities.due_today,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, totalDue: s.totalDue, minimumDue: s.minimumDue, dueDate: s.dueDate, statementDate: s.date },
          expiresAt: endOfIstDay(s.dueDate),
          templateTitle: `${c.label} bill due today`,
          templateBody: `Your ${c.label} bill (${inr(s.totalDue)}) is due today.`,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} shows ${inr(s.totalDue)} due today, ${shortDate(s.dueDate)}.`,
        },
      ];
    });
  },
};

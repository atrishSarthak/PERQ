import type { NudgeRule } from "./types";
import { endOfIstDay, inr, plusDays, shortDate } from "./util";

/** Last statement carried a balance and charged interest. Rupee rule: reconciled statements only. */
export const minDueTrap: NudgeRule = {
  id: "min_due_trap",
  description: "Your last statement charged interest because part of the previous bill was carried over.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const s = c.latestStatement;
      if (!s?.reconciled || !s.financeCharges || s.financeCharges <= 0 || !s.previousBalance || !s.totalDue) return [];
      return [
        {
          ruleId: "min_due_trap",
          dedupeKey: `min_due_trap:${c.cardAccountId}:${s.date}`,
          priority: config.priorities.min_due_trap,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, interest: s.financeCharges, totalDue: s.totalDue, statementDate: s.date },
          expiresAt: endOfIstDay(s.dueDate ?? plusDays(s.date, 20)),
          templateTitle: `${inr(s.financeCharges)} in interest on ${c.label}`,
          templateBody: `You paid ${inr(s.financeCharges)} in interest last cycle. Paying the full ${inr(s.totalDue)} avoids it.`,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} shows ${inr(s.financeCharges)} in finance charges, which banks add when only part of a bill is paid.`,
        },
      ];
    });
  },
};

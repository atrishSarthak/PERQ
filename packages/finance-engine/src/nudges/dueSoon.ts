import type { NudgeRule } from "./types";
import { endOfIstDay, inr, shortDate, weekday } from "./util";

/**
 * Bill due in 1–3 days, not marked paid. A statement whose totals didn't
 * reconcile still gets the reminder, but without a rupee amount (§5.4, §16).
 */
export const dueSoon: NudgeRule = {
  id: "due_soon",
  description: "A card bill is due in the next few days and you haven't marked it paid.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const s = c.latestStatement;
      if (!s?.dueDate || !s.totalDue || c.isPaidMarked || c.daysToDue === null) return [];
      const amount = s.reconciled;
      if (c.daysToDue < config.dueSoonDays[0] || c.daysToDue > config.dueSoonDays[1]) return [];
      const payload = {
        cardLabel: c.label,
        totalDue: amount ? s.totalDue : null,
        minimumDue: amount ? s.minimumDue : null,
        dueDate: s.dueDate,
        dueWeekday: weekday(s.dueDate),
        daysToDue: c.daysToDue,
        statementDate: s.date,
      };
      return [
        {
          ruleId: "due_soon",
          dedupeKey: `due_soon:${c.cardAccountId}:${s.date}`,
          priority: config.priorities.due_soon,
          cardAccountId: c.cardAccountId,
          payload,
          expiresAt: endOfIstDay(s.dueDate),
          templateTitle: `${c.label} bill due ${weekday(s.dueDate)}`,
          templateBody: amount
            ? `Your ${c.label} bill of ${inr(s.totalDue)} is due on ${weekday(s.dueDate)}, ${shortDate(s.dueDate)}.`
            : `Your ${c.label} bill is due on ${weekday(s.dueDate)}, ${shortDate(s.dueDate)}. Check the amount on the statement itself.`,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} shows ${amount ? `${inr(s.totalDue)} ` : "a bill "}due on ${shortDate(s.dueDate)}, ${c.daysToDue} day${c.daysToDue === 1 ? "" : "s"} from today.`,
        },
      ];
    });
  },
};

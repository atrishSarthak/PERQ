import type { NudgeRule } from "./types";
import { endOfIstDay, inr, plusDays, shortDate } from "./util";

/** Fee, GST, late-fee or markup lines on the last statement. Rupee rule: reconciled only. */
export const feesCharged: NudgeRule = {
  id: "fees_charged",
  description: "Your last statement had fees or charges (late fee, GST, forex markup and similar).",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const s = c.latestStatement;
      if (!s?.reconciled || c.feesLastCycle.total < 1) return [];
      const late = c.feesLastCycle.lines.find((l) => /LATE/i.test(l.description));
      const biggest = [...c.feesLastCycle.lines].sort((a, b) => b.amount - a.amount)[0]!;
      const lead = late ?? biggest;
      const leadAmount = Math.round(lead.amount);
      const leadName = late ? "late fee" : lead.description.toLowerCase();
      return [
        {
          ruleId: "fees_charged",
          dedupeKey: `fees_charged:${c.cardAccountId}:${s.date}`,
          priority: config.priorities.fees_charged,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, total: c.feesLastCycle.total, leadAmount, leadName, statementDate: s.date, lineCount: c.feesLastCycle.lines.length },
          expiresAt: endOfIstDay(plusDays(s.date, 30)),
          templateTitle: `${inr(c.feesLastCycle.total)} in fees on ${c.label}`,
          templateBody:
            c.feesLastCycle.lines.length > 1
              ? `${inr(c.feesLastCycle.total)} in fees on your ${c.label} statement, including a ${inr(leadAmount)} ${leadName}.`
              : `${inr(c.feesLastCycle.total)} in fees on your ${c.label} statement (${leadName}).`,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} has ${c.feesLastCycle.lines.length} fee or charge line${c.feesLastCycle.lines.length === 1 ? "" : "s"} totalling ${inr(c.feesLastCycle.total)}.`,
        },
      ];
    });
  },
};

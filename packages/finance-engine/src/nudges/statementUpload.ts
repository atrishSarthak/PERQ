import type { NudgeRule } from "./types";
import { daysBetween, endOfIstDay, plusDays, shortDate } from "./util";

/** The next statement should be out (2+ days past the expected date) and hasn't been uploaded. */
export const statementUpload: NudgeRule = {
  id: "statement_upload",
  description: "A new statement should be out by now, and uploading it keeps your numbers current.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      if (!c.nextStatementDate) return [];
      const late = daysBetween(c.nextStatementDate, state.asOf);
      if (late < config.statementLateAfterDays) return [];
      return [
        {
          ruleId: "statement_upload",
          dedupeKey: `statement_upload:${c.cardAccountId}:${c.nextStatementDate}`,
          priority: config.priorities.statement_upload,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, expectedDate: c.nextStatementDate, daysLate: late },
          expiresAt: endOfIstDay(plusDays(c.nextStatementDate, 25)),
          templateTitle: `New ${c.label} statement`,
          templateBody: `Your ${c.label} statement should be out. Upload it to keep your numbers current.`,
          why: `Your last ${c.label} statement was dated ${shortDate(c.latestStatement!.date)}, so the next one was expected around ${shortDate(c.nextStatementDate)}.`,
        },
      ];
    });
  },
};

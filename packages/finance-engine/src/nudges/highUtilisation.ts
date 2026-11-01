import { amountToReachUtilisation } from "../state";
import type { NudgeRule } from "./types";
import { endOfIstDay, inr, shortDate } from "./util";

/**
 * Utilisation ≥ 70% with the statement closing within 5 days (warn), or ≥ 30%
 * (info). Uses a reconciled statement balance or the user's own newer balance.
 */
export const highUtilisation: NudgeRule = {
  id: "high_utilisation",
  description: "A card is using a large share of its credit limit, which can count against your credit score when the statement closes.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      if (c.utilisationPct === null || !c.creditLimit || c.balanceForUtilisation === null || !c.nextStatementDate) return [];
      if (c.balanceSource === "statement" && !c.latestStatement?.reconciled) return [];
      const warn = c.utilisationPct >= config.utilisationWarnPct && c.daysToStatement !== null && c.daysToStatement >= 0 && c.daysToStatement <= config.statementClosesWithinDays;
      const info = !warn && c.utilisationPct >= config.utilisationInfoPct;
      if (!warn && !info) return [];
      const pay = amountToReachUtilisation(c.balanceForUtilisation, c.creditLimit, config.utilisationTargetPct);
      const pct = Math.round(c.utilisationPct);
      const level = warn ? "warn" : "info";
      return [
        {
          ruleId: "high_utilisation",
          dedupeKey: `high_utilisation:${c.cardAccountId}:${c.nextStatementDate}:${level}`,
          priority: warn ? config.priorities.high_utilisation_warn : config.priorities.high_utilisation_info,
          cardAccountId: c.cardAccountId,
          payload: {
            cardLabel: c.label,
            utilisationPct: pct,
            balance: c.balanceForUtilisation,
            creditLimit: c.creditLimit,
            payToReach30: pay,
            targetPct: config.utilisationTargetPct,
            daysToStatement: c.daysToStatement,
            statementCloses: c.nextStatementDate,
            level,
          },
          expiresAt: endOfIstDay(c.nextStatementDate),
          templateTitle: `${c.label} at ${pct}% of its limit`,
          templateBody: warn
            ? `You're at ${pct}% of your limit and the statement closes in ${c.daysToStatement} day${c.daysToStatement === 1 ? "" : "s"}. Paying ${inr(pay)} brings it under ${config.utilisationTargetPct}%.`
            : `${c.label} is at ${pct}% of its limit. Paying ${inr(pay)} brings it under ${config.utilisationTargetPct}%.`,
          why: `${inr(c.balanceForUtilisation)} ${c.balanceSource === "override" ? "(the balance you entered)" : "on your last statement"} against a ${inr(c.creditLimit)} limit is ${pct}%. Banks report the balance when the statement closes, around ${shortDate(c.nextStatementDate)}.`,
        },
      ];
    });
  },
};

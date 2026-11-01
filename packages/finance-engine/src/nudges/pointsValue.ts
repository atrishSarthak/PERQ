import type { NudgeRule } from "./types";
import { daysBetween, endOfIstDay, inr, plusDays, shortDate } from "./util";

/** Points worth ≥ ₹500, or points expiring (printed). Printed values, so unreconciled is fine. */
export const pointsValue: NudgeRule = {
  id: "points_value",
  description: "You have reward points worth spending, or some are about to expire.",
  evaluate(state, { config }) {
    return state.cards.flatMap((c) => {
      const p = c.points;
      const s = c.latestStatement;
      if (!p || !s) return [];
      const valuable = p.valueRupees !== null && p.valueRupees >= config.pointsValueMin;
      const expiring = !!p.expiring && p.expiring > 0;
      if (!valuable && !expiring) return [];
      const soon = expiring && !!p.expiryDate && daysBetween(state.asOf, p.expiryDate) <= config.pointsExpiringWithinDays;
      const closing = p.closing.toLocaleString("en-IN");
      const body =
        p.valueRupees !== null
          ? soon
            ? `${closing} points on your ${c.label}, worth about ${inr(p.valueRupees)}. ${p.expiring!.toLocaleString("en-IN")} expire on ${shortDate(p.expiryDate!)}.`
            : `${closing} points on your ${c.label}, worth about ${inr(p.valueRupees)}.`
          : `${p.expiring!.toLocaleString("en-IN")} points on your ${c.label} expire${p.expiryDate ? ` on ${shortDate(p.expiryDate)}` : " soon"}.`;
      return [
        {
          ruleId: "points_value",
          dedupeKey: `points_value:${c.cardAccountId}:${s.date}`,
          priority: soon ? config.priorities.points_value_expiring : config.priorities.points_value,
          cardAccountId: c.cardAccountId,
          payload: { cardLabel: c.label, points: p.closing, valueRupees: p.valueRupees, expiring: p.expiring, expiryDate: p.expiryDate, statementDate: s.date },
          expiresAt: endOfIstDay(p.expiryDate ?? plusDays(s.date, 30)),
          templateTitle: soon ? `Points expiring on ${c.label}` : `${closing} points on ${c.label}`,
          templateBody: body,
          why: `Your ${c.label} statement dated ${shortDate(s.date)} prints ${closing} points${p.valueRupees !== null ? `; at this card's published redemption value that's about ${inr(p.valueRupees)}` : ""}.`,
        },
      ];
    });
  },
};

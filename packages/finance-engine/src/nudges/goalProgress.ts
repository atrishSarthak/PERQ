import type { NudgeRule } from "./types";
import { endOfIstDay, inr, plusDays } from "./util";

/** A savings goal is more than 15% behind its straight-line plan. */
export const goalProgress: NudgeRule = {
  id: "goal_progress",
  description: "A savings goal is behind the pace needed to reach it by its date.",
  evaluate(state, { config }) {
    return state.goals.flatMap((g) => {
      if (!g.expectedSaved || g.expectedSaved <= 0 || g.monthlyNeeded === null) return [];
      if (g.behindBy / g.expectedSaved <= config.goalBehindPct) return [];
      return [
        {
          ruleId: "goal_progress",
          dedupeKey: `goal_progress:${g.id}:${state.month.key}`,
          priority: config.priorities.goal_progress,
          payload: { goalName: g.name, behindBy: g.behindBy, monthlyNeeded: g.monthlyNeeded, saved: g.saved, target: g.target, targetDate: g.targetDate },
          expiresAt: endOfIstDay(plusDays(state.asOf, 14)),
          templateTitle: `${g.name} is behind plan`,
          templateBody: `${g.name} is ${inr(g.behindBy)} behind plan. ${inr(g.monthlyNeeded)} a month gets you there.`,
          why: `You've saved ${inr(g.saved)} of ${inr(g.target)}. On a steady path to ${g.targetDate ?? "your date"} you'd have about ${inr(g.saved + g.behindBy)} by now.`,
        },
      ];
    });
  },
};

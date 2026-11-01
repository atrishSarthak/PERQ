import { NUDGE_CONFIG } from "../nudges/config";

// Planner thresholds (Step 3 §5). Utilisation info/warn reuse the Step 2
// nudge config so the planner and nudges never disagree.
export const PLANNER_CONFIG = {
  engineVersion: 1,
  /** Default buying window when there's no need-by date (§5.5). */
  defaultWindowDays: 14,
  /** Timing advice only when the best day gains at least this many interest-free days. */
  timingMinGainDays: 10,
  utilisationInfoPct: NUDGE_CONFIG.utilisationInfoPct, // 30
  utilisationWarnPct: NUDGE_CONFIG.utilisationWarnPct, // 70
  utilisationBlockPct: 90,
  utilisationTargetPct: NUDGE_CONFIG.utilisationTargetPct, // 30
  /** rethink_payment: the chosen way to pay costs this much extra (₹) and a cheaper option exists. */
  rethinkExtraCost: 500,
  /** wait: price exceeds what's left this month by more than this %. */
  waitOverBudgetPct: 25,
  /** ...unless the user needs it within this many days. */
  waitNeedByDays: 14,
  /** wait: a goal would slip by more than this many months. */
  goalSlipMonths: 1,
  /** No-cost EMI: interest rate assumed when the offer doesn't print one (% p.a.). */
  noCostAssumedRatePa: 15,
  /** No budget: income band midpoint × this = rough discretionary limit (§5.7). */
  incomeDiscretionaryShare: 0.3,
  /** Size label: price as a share of monthly income. */
  sizeSmallPct: 10,
  sizeLargePct: 40,
  /** Plans not acted on expire this many days after need-by, or after creation without one (§8). */
  expireAfterNeedByDays: 30,
  expireAfterCreatedDays: 45,
} as const;

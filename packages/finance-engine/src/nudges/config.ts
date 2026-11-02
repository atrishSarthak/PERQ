// Every nudge threshold in one place (handoff §7.2).
export const NUDGE_CONFIG = {
  dailyCap: 2,
  quietStartHourIst: 22, // no push from 22:00…
  quietEndHourIst: 8, // …until 08:00
  sendAfterQuietHourIst: 9, // queued until 09:00
  dueSoonDays: [1, 3] as const,
  utilisationWarnPct: 70,
  utilisationInfoPct: 30,
  utilisationTargetPct: 30,
  statementClosesWithinDays: 5,
  statementLateAfterDays: 2,
  feeWaiverMonthsLeft: 4,
  feeWaiverNearPct: 0.15,
  missedRewardsMin: 100,
  pointsValueMin: 500,
  pointsExpiringWithinDays: 60,
  budgetPacePct: 0.8,
  budgetPaceMinDaysLeft: 7,
  goalBehindPct: 0.15,
  swiggyLateNightMin: 3, // late-night food orders in 7 days
  swiggyFeeSharePct: 0.25, // fees as a share of food spend this month
  suppression: { dismissals: 3, windowDays: 30, penalty: 30 },
  priorities: {
    due_today: 95,
    due_soon: 90,
    min_due_trap: 85,
    high_utilisation_warn: 75,
    fees_charged: 70,
    statement_upload: 60,
    fee_waiver_pace: 55,
    missed_rewards: 50,
    budget_pace: 50,
    points_value: 45,
    points_value_expiring: 65,
    high_utilisation_info: 40,
    goal_progress: 35,
    plan_buy_window: 80,
    swiggy_pattern: 55,
  },
} as const;
export type NudgeConfig = typeof NUDGE_CONFIG;

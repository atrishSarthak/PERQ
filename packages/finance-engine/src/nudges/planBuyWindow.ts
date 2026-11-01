import type { PlanResult, Verdict } from "@perq/shared";
import { formatDay } from "../format";
import { planTemplateExplanation } from "../planner/explain";
import { istDate } from "../state";
import { NUDGE_CONFIG, type NudgeConfig } from "./config";
import type { NudgeCandidate } from "./types";
import { daysBetween, endOfIstDay, inr, plusDays, shortDate } from "./util";

// plan_buy_window (Step 3 §8): on the day the user asked to be reminded,
// the plan is re-run on fresh state by the caller and this words the nudge
// from the new result, saying so when the verdict changed. Not a NudgeRule:
// it needs plans and a re-run plan, which FinancialState doesn't hold.

export interface PlanReminder {
  planId: string;
  itemName: string;
  remindAt: string; // IST day
  /** The verdict and headline the user saw when they set the reminder. */
  previousVerdict: Verdict | null;
  previousHeadline: string | null;
  /** The plan re-run today. */
  result: PlanResult;
}

/** A reminder stays live this many days after its day (missed by the cap or quiet hours). */
export const PLAN_REMINDER_LIVE_DAYS = 3;

export const planDedupeKey = (planId: string, remindAt: string) => `plan_buy_window:${planId}:${remindAt}`;
/** The plan id in a plan_buy_window dedupe key. */
export const planIdFromDedupeKey = (key: string): string | null => (key.startsWith("plan_buy_window:") ? key.split(":")[1] ?? null : null);

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** "Go ahead" and "Go ahead, on <day>" are one answer: the day arriving isn't a change. */
const family = (v: Verdict) => (v === "go_with_timing" ? "go" : v);

export const PLAN_BUY_WINDOW_DESCRIPTION = "You asked Ember to remind you about a purchase plan on this day; it re-checks the plan with fresh numbers first.";

export function planBuyWindowCandidates(plans: PlanReminder[], now: Date, config: NudgeConfig = NUDGE_CONFIG): NudgeCandidate[] {
  const today = istDate(now);
  return plans
    .filter((p) => p.remindAt <= today && daysBetween(p.remindAt, today) < PLAN_REMINDER_LIVE_DAYS)
    .map((p) => {
      const r = p.result;
      const o = r.recommended;
      const changed = p.previousVerdict !== null && family(p.previousVerdict) !== family(r.verdict);
      const item = p.itemName;
      let body: string;
      if (changed) {
        const reason = planTemplateExplanation(r).split(/(?<=\.)\s+/)[1] ?? "";
        body = `Ember re-checked your ${item} plan with today's numbers, and the answer changed: ${lcFirst(r.headline)}, not ${lcFirst(p.previousHeadline ?? "")}. ${reason}`.trim();
      } else if (r.verdict === "go" || r.verdict === "go_with_timing") {
        const when = o.purchaseDate === today ? "Today works" : `${formatDay(o.purchaseDate)} is the day`;
        const how = o.kind === "upi" ? "pay by UPI or debit" : `use your ${o.label}`;
        body = `${when} for the ${item}: ${how}. After offers and rewards it costs ${inr(o.netCost)}.`;
      } else if (r.verdict === "wait") {
        const left = r.affordability.leftThisMonth;
        body = `Ember re-checked your ${item} plan: it's still better to wait.${left !== null ? ` You have ${inr(Math.max(0, left))} left to spend this month.` : ""}`;
      } else {
        body = `Ember re-checked your ${item} plan: ${lcFirst(r.headline)}. It costs ${inr(o.netCost)} that way.`;
      }
      return {
        ruleId: "plan_buy_window",
        dedupeKey: planDedupeKey(p.planId, p.remindAt),
        priority: config.priorities.plan_buy_window,
        ...(o.cardAccountId ? { cardAccountId: o.cardAccountId } : {}),
        payload: {
          planId: p.planId,
          itemName: item,
          verdict: r.verdict,
          headline: r.headline,
          changed,
          previousHeadline: p.previousHeadline,
          cardLabel: o.kind === "upi" ? null : o.label,
          purchaseDate: o.purchaseDate,
          netCost: o.netCost,
          savingVsUpi: o.savingVsUpi,
          leftThisMonth: r.affordability.leftThisMonth,
          utilisationAfterPct: o.utilisationAfterPct,
          interestFreeDays: o.interestFreeDays,
        },
        expiresAt: endOfIstDay(plusDays(p.remindAt, PLAN_REMINDER_LIVE_DAYS - 1)),
        templateTitle: changed ? `Your ${item} plan changed` : `Your ${item} plan`,
        templateBody: body,
        why: `You asked Ember to remind you on ${shortDate(p.remindAt)} about the ${item}. It re-ran the plan with today's balances, budget and offers.`,
      };
    });
}

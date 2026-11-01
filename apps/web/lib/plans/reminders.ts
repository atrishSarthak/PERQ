import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db, purchasePlans, type PurchasePlanRow } from "@perq/db";
import { addDays, istDate, isPlanExpired, PlanChoiceError, planPurchase, type PlanContext, type PlanReminder } from "@perq/finance-engine";
import type { PlanChoice, PlanResult, Verdict } from "@perq/shared";
import { logActivity } from "@/lib/money/activity";
import { loadPlanContext } from "./context";
import { planInputOf } from "./service";

// Plan follow-up for the nudge engine (Step 3 §8): reminders re-run on fresh
// state, and expiry of plans nobody acted on.

/** Re-runs a saved plan on `ctx`, keeping the user's what-if pick when it still exists. */
export function replan(row: PurchasePlanRow, ctx: PlanContext): PlanResult {
  const choice = (row.inputsSnapshot as { choice?: PlanChoice } | null)?.choice;
  try {
    return planPurchase(planInputOf(row), ctx, choice);
  } catch (err) {
    if (err instanceof PlanChoiceError) return planPurchase(planInputOf(row), ctx);
    throw err;
  }
}

/** Reminders due within `days` (the Expo Go simulation looks a week ahead), re-planned as of `now`. */
export async function planReminders(userId: string, now: Date, days = 0): Promise<PlanReminder[]> {
  const rows = await db
    .select()
    .from(purchasePlans)
    .where(
      and(
        eq(purchasePlans.userId, userId),
        eq(purchasePlans.status, "reminder_set"),
        isNotNull(purchasePlans.remindAt),
        lte(purchasePlans.remindAt, addDays(istDate(now), days))
      )
    );
  if (!rows.length) return [];
  const { ctx } = await loadPlanContext(userId, now);
  return rows.map((row) => ({
    planId: row.id,
    itemName: row.itemName,
    remindAt: row.remindAt!,
    previousVerdict: (row.verdict as Verdict | null) ?? null,
    previousHeadline: (row.result as PlanResult | null)?.headline ?? null,
    result: replan(row, ctx),
  }));
}

/** Marks open plans past their expiry (§8) as expired. */
export async function expireStalePlans(userId: string, now: Date): Promise<number> {
  const today = istDate(now);
  const rows = await db
    .select({ id: purchasePlans.id, itemName: purchasePlans.itemName, status: purchasePlans.status, needByDate: purchasePlans.needByDate, createdAt: purchasePlans.createdAt })
    .from(purchasePlans)
    .where(and(eq(purchasePlans.userId, userId), inArray(purchasePlans.status, ["draft", "planned", "reminder_set"])));
  const stale = rows.filter((r) => isPlanExpired({ status: r.status, needByDate: r.needByDate, createdDay: istDate(r.createdAt) }, today));
  if (!stale.length) return 0;
  await db
    .update(purchasePlans)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(purchasePlans.userId, userId), inArray(purchasePlans.id, stale.map((r) => r.id))));
  for (const r of stale) await logActivity(userId, "plan_expired", `A plan expired: ${r.itemName}`, { table: "purchase_plans", id: r.id });
  return stale.length;
}

/** Users with a plan reminder due today or earlier: they get a nudge run even without card accounts. */
export async function reminderUserIds(now: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: purchasePlans.userId })
    .from(purchasePlans)
    .where(and(eq(purchasePlans.status, "reminder_set"), lte(purchasePlans.remindAt, istDate(now))));
  return rows.map((r) => r.userId);
}

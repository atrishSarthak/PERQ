import type { SwiggyOrder, SwiggySummary } from "@perq/shared";
import { IST_OFFSET_MIN, istDate } from "./state";

// Swiggy spend (Step 4 Lite): what this month's food and Instamart orders
// cost, how much of it was fees, and the late-night (22:00–05:00 IST) pattern.

export const LATE_NIGHT_START_HOUR_IST = 22;
export const LATE_NIGHT_END_HOUR_IST = 5;
const WEEK_MS = 7 * 86_400_000;

/** A food order placed between 22:00 and 05:00 IST. */
export function isLateNight(o: Pick<SwiggyOrder, "service" | "orderedAt">): boolean {
  if (o.service !== "food") return false;
  const h = new Date(Date.parse(o.orderedAt) + IST_OFFSET_MIN * 60_000).getUTCHours();
  return h >= LATE_NIGHT_START_HOUR_IST || h < LATE_NIGHT_END_HOUR_IST;
}

const feesOf = (o: SwiggyOrder) => o.fees.reduce((s, f) => s + f.amount, 0);

/**
 * This month's (`month` = YYYY-MM, IST) Swiggy spend, and late-night food
 * orders in the 7 days up to `now`. `foodBudgetLimit` is the user's food
 * delivery budget, compared with Swiggy food spend.
 */
export function swiggySummary(orders: SwiggyOrder[], month: string, now: Date, foodBudgetLimit: number | null = null): SwiggySummary {
  const inMonth = orders.filter((o) => istDate(new Date(o.orderedAt)).slice(0, 7) === month && Date.parse(o.orderedAt) <= now.getTime());
  const sum = (list: SwiggyOrder[], f: (o: SwiggyOrder) => number = (o) => o.total) => list.reduce((s, o) => s + f(o), 0);
  const food = inMonth.filter((o) => o.service === "food");
  const week = orders
    .filter((o) => isLateNight(o) && Date.parse(o.orderedAt) <= now.getTime() && Date.parse(o.orderedAt) > now.getTime() - WEEK_MS)
    .sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
  const foodSpend = sum(food);
  const today = istDate(now);
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = istDate(new Date(Date.parse(`${today}T12:00:00Z`) - (6 - i) * 86_400_000));
    const day = orders.filter((o) => istDate(new Date(o.orderedAt)) === date && Date.parse(o.orderedAt) <= now.getTime());
    const f = sum(day.filter((o) => o.service === "food"));
    const m = sum(day.filter((o) => o.service === "instamart"));
    return { date, food: f, instamart: m, total: f + m };
  });
  return {
    month,
    spend: sum(inMonth),
    foodSpend,
    groceriesSpend: sum(inMonth.filter((o) => o.service === "instamart")),
    fees: sum(inMonth, feesOf),
    orders: inMonth.length,
    lateNightOrders: food.filter(isLateNight).length,
    lateNightWeek: { count: week.length, amount: sum(week), latestDay: week.length ? istDate(new Date(week.at(-1)!.orderedAt)) : null },
    last7Days,
    foodBudget: foodBudgetLimit !== null && foodBudgetLimit > 0 ? { limit: foodBudgetLimit, left: foodBudgetLimit - foodSpend } : null,
  };
}

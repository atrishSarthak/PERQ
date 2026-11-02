import { describe, expect, it } from "vitest";
import type { SwiggyOrder } from "@perq/shared";
import { buildFinancialState, evaluateRules, isLateNight, planNudges, swiggySummary, validateNudgeCopy } from "../src";

// Step 4: Swiggy spend, fees, the food/grocery split, late-night orders
// (22:00–05:00 IST) and the swiggy_pattern nudge.

const NOW = new Date("2026-11-22T03:30:00Z"); // 22 Nov, 09:00 IST
const order = (id: string, service: "food" | "instamart", istAt: string, total: number, fees = 40): SwiggyOrder => ({
  id,
  service,
  orderedAt: new Date(`${istAt}+05:30`).toISOString(),
  restaurant: service === "food" ? "Somewhere" : null,
  items: [{ name: "x", qty: 1, price: total - fees }],
  itemTotal: total - fees,
  fees: [{ label: "Delivery fee", amount: fees }],
  total,
});

const ORDERS = [
  order("a", "food", "2026-10-30T23:00", 500), // last month
  order("b", "food", "2026-11-03T13:00", 300),
  order("c", "instamart", "2026-11-05T10:00", 800, 9),
  order("d", "food", "2026-11-16T23:10", 420), // late-night, this week
  order("e", "food", "2026-11-18T00:40", 515),
  order("f", "food", "2026-11-19T23:30", 465),
  order("g", "food", "2026-11-21T04:59", 500),
  order("h", "food", "2026-11-21T05:00", 200), // 05:00 isn't late-night
  order("i", "food", "2026-11-23T23:00", 999), // after now: not counted
];

describe("swiggySummary", () => {
  it("adds up the month, fees and the food/grocery split", () => {
    const s = swiggySummary(ORDERS, "2026-11", NOW, 5000);
    expect(s).toMatchObject({ month: "2026-11", foodSpend: 2400, groceriesSpend: 800, spend: 3200, fees: 6 * 40 + 9, orders: 7 });
    expect(s.foodBudget).toEqual({ limit: 5000, left: 2600 });
  });

  it("counts late-night food orders, 22:00 to 05:00 IST, in the month and the last 7 days", () => {
    expect(isLateNight(ORDERS[4]!)).toBe(true);
    expect(isLateNight(ORDERS[7]!)).toBe(false);
    const s = swiggySummary(ORDERS, "2026-11", NOW);
    expect(s.lateNightOrders).toBe(4);
    expect(s.lateNightWeek).toEqual({ count: 4, amount: 1900, latestDay: "2026-11-21" });
    expect(s.foodBudget).toBeNull();
  });

  it("is in the financial state only when Swiggy is connected, and drives swiggy_pattern", () => {
    const base = { now: NOW, cardAccounts: [], statements: [], transactions: [], budget: { totalLimit: 28000, categoryLimits: { food_delivery: 5000 } }, goals: [] };
    expect(buildFinancialState(base).swiggy).toBeNull();
    const state = buildFinancialState({ ...base, swiggyOrders: ORDERS });
    expect(state.swiggy?.foodBudget?.left).toBe(2600);
    const [c, ...rest] = evaluateRules(state, NOW, []).filter((x) => x.ruleId === "swiggy_pattern");
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ priority: 55, dedupeKey: "swiggy_pattern:late_night:2026-11-21" });
    expect(c!.templateBody).toBe("4 late-night orders this week, ₹1,900. ₹2,600 left in your food budget for 9 days.");
    expect(validateNudgeCopy({ title: c!.templateTitle, body: c!.templateBody }, c!.payload, { title: c!.templateTitle, body: c!.templateBody })).toEqual({ ok: true });
  });

  it("fires on fees at 25% or more of food spend", () => {
    const pricey = [order("x", "food", "2026-11-10T13:00", 200, 60)];
    const state = buildFinancialState({ now: NOW, cardAccounts: [], statements: [], transactions: [], budget: null, goals: [], swiggyOrders: pricey });
    const [c] = evaluateRules(state, NOW, []).filter((x) => x.ruleId === "swiggy_pattern");
    expect(c?.payload).toMatchObject({ pattern: "fees", fees: 60, foodSpend: 200, pct: 30 });
  });
});

describe("in-app-only swiggy_pattern", () => {
  it("reaches the inbox when the daily cap is used up, and is never queued", () => {
    const state = buildFinancialState({ now: NOW, cardAccounts: [], statements: [], transactions: [], budget: null, goals: [], swiggyOrders: ORDERS });
    const sent = (k: string) => ({ ruleId: "due_soon", dedupeKey: k, status: "sent", sentAt: NOW.toISOString(), dismissedAt: null, actedAt: null, createdAt: NOW.toISOString() });
    const plan = planNudges({ candidates: evaluateRules(state, NOW, []), queued: [], history: [sent("a"), sent("b")], now: NOW });
    expect(plan.capRemaining).toBe(0);
    expect(plan.sendFresh.map((c) => c.ruleId)).toEqual(["swiggy_pattern"]);
    expect(plan.queueFresh.filter((c) => c.ruleId === "swiggy_pattern")).toEqual([]);
  });
});

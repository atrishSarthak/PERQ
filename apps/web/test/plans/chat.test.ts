import { describe, expect, it, vi } from "vitest";
import type { PurchasePlanRow } from "@perq/db";
import { planPurchase, type PlanCard, type PlanContext } from "@perq/finance-engine";
import { planInputSchema } from "@perq/shared";

// The planner in chat (Step 3 §6.4, §7.1, §8): the extract tool only shows a
// confirmation card, what-ifs aren't saved, plan threads name real cards.

vi.mock("@/lib/plans/service", () => ({
  getPlanRow: vi.fn(),
  listPlans: vi.fn(async () => []),
  toSummary: vi.fn(),
  planInputOf: (row: PurchasePlanRow) => ({ item: { name: row.itemName, category: row.category }, price: row.price, offers: [], emiOptions: row.emiOptions ?? [] }),
}));
vi.mock("@/lib/plans/extract", () => ({
  extractFromText: vi.fn(async () => ({ draft: { item: { name: "Phone", category: "online_shopping" }, offers: [], emiOptions: [] }, missing: ["price"], notes: [] })),
}));

import { getPlanRow } from "@/lib/plans/service";
import { planChips } from "@/lib/ember/plans/prompts";
import { createPlanTools } from "@/lib/ember/plans/tools";

const TODAY = "2026-11-22";
const toolCtx = { userId: "u", task: "chat", runId: "r" };
const card = (id: string, over: Partial<PlanCard> = {}): PlanCard => ({
  cardAccountId: id,
  label: id.toUpperCase(),
  issuer: "Some Bank",
  terms: null,
  statementDay: 25,
  dueDay: 14,
  creditLimit: 500000,
  balance: 0,
  hasUnreconciled: false,
  monthSpendByCategory: {},
  ...over,
});
const ctx: PlanContext = { today: TODAY, cards: [card("a"), card("b")], leftToSpend: 5000, monthBudget: 50000, monthSpend: 0, goals: [], monthlyIncome: null, averageMonthlySpend: null, hasStatements: true };
const input = planInputSchema.parse({ item: { name: "Phone", category: "online_shopping" }, price: 40000 });
const row = { id: "11111111-1111-4111-8111-111111111111", userId: "u", itemName: "Phone", category: "online_shopping", price: 40000, emiOptions: [], result: planPurchase(input, ctx) } as unknown as PurchasePlanRow;

const tools = (onPlanConfirm = vi.fn()) => {
  const list = createPlanTools({ userId: "u", extract: { apiKey: null, userId: "u" }, loadCtx: async () => ctx, onPlanConfirm });
  return { onPlanConfirm, byName: (n: string) => list.find((t) => t.name === n)! };
};

describe("plan tools in chat", () => {
  it("there's no tool that plans from chat numbers: only extract, list, get and what-if", () => {
    const { byName } = tools();
    expect(["extractPlanFromMessage", "listPlans", "getPlan", "whatIfPlan"].map((n) => !!byName(n))).toEqual([true, true, true, true]);
    expect(createPlanTools({ userId: "u", extract: { apiKey: null, userId: "u" }, loadCtx: async () => ctx }).map((t) => t.name)).not.toContain("planPurchase");
  });

  it("extract shows one confirmation card per turn and asks for a missing price", async () => {
    const { byName, onPlanConfirm } = tools();
    const out = (await byName("extractPlanFromMessage").handler({ text: "should I buy a phone" } as never, toolCtx)) as { next: string };
    await byName("extractPlanFromMessage").handler({ text: "a phone" } as never, toolCtx);
    expect(onPlanConfirm).toHaveBeenCalledTimes(1);
    expect(onPlanConfirm.mock.calls[0]![1]).toEqual(["price"]);
    expect(out.next).toMatch(/ask the user for the price/i);
  });

  it("what-if waits a month from the user's day, unsaved, with the template wording", async () => {
    vi.mocked(getPlanRow).mockResolvedValue(row);
    const { byName } = tools();
    const out = (await byName("whatIfPlan").handler({ planId: row.id, changes: { waitDays: 30 } } as never, toolCtx)) as { notSaved: boolean; result: { recommended: { purchaseDate: string }; budget: { month: string; leftToSpend: number } }; template: string };
    expect(out.notSaved).toBe(true);
    expect(out.result.recommended.purchaseDate).toBe("2026-12-22");
    expect(out.result.budget).toMatchObject({ month: "2026-12", leftToSpend: 50000 });
    expect(out.template).toMatch(/^Go ahead/);
  });

  it("a pick that doesn't exist is an error the model can relay", async () => {
    vi.mocked(getPlanRow).mockResolvedValue(row);
    const out = (await tools().byName("whatIfPlan").handler({ planId: row.id, changes: { emiTenure: 6 } } as never, toolCtx)) as { error?: string };
    expect(out.error).toMatch(/no EMI/);
  });
});

describe("plan thread chips", () => {
  it("name the other card, and only offer the EMI when the plan has one", () => {
    const labels = planChips(row).map((c) => c.label);
    expect(labels).toContain("What if I wait a month?");
    expect(labels.some((l) => /^What if I use my (A|B)\?$/.test(l))).toBe(true);
    expect(labels).not.toContain("What if I use the EMI?");
    expect(planChips({ ...row, emiOptions: [{ tenureMonths: 6, noCost: true }] } as PurchasePlanRow).map((c) => c.label)).toContain("What if I use the EMI?");
  });
});

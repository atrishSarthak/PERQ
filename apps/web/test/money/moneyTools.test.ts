// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildFinancialState, type CardTerms } from "@perq/finance-engine";
import { createMoneyTools, type MoneyToolContext } from "@/lib/ember/money/tools";
import { chatTurn, moneyFallback, systemPromptFor } from "@/lib/ember/money/run";

const ace: CardTerms = { id: "axis-ace", name: "Axis Ace", rewardRates: { food_delivery: 4, bills: 5, other: 1.5 }, redemptionValue: null, feeWaiverSpend: 200000, annualFee: 499 };
const now = new Date("2026-11-12T04:30:00Z");
const state = buildFinancialState({
  now,
  cardAccounts: [{ id: "axis", label: "Axis Ace", last4: "0093", issuer: "Axis Bank", creditLimit: 50000, feeAnniversaryMonth: 12, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: ace }],
  statements: [{ id: "s1", cardAccountId: "axis", statementDate: "2026-10-16", dueDate: "2026-11-12", totalDue: 37000, minimumDue: 1850, previousBalance: 0, paymentsCredits: 0, feesCharges: 0, financeCharges: 0, creditLimit: null, pointsClosing: null, pointsExpiring: null, pointsExpiryDate: null, reconciled: true, markedPaidAt: null }],
  transactions: [
    { id: "t1", cardAccountId: "axis", statementId: "s1", txnDate: "2026-10-02", amount: 4100, direction: "debit", kind: "purchase", category: "food_delivery", merchant: "SWIGGY", description: "SWIGGY BANGALORE" },
    { id: "t2", cardAccountId: "axis", statementId: "s1", txnDate: "2026-10-05", amount: 900, direction: "debit", kind: "purchase", category: "food_delivery", merchant: "ZOMATO", description: "ZOMATO" },
  ],
  budget: null,
  goals: [],
});
const ctx: MoneyToolContext = {
  state,
  transactions: [
    { id: "t1", cardAccountId: "axis", date: "2026-10-02", merchant: "SWIGGY", amount: 4100, direction: "debit", kind: "purchase", category: "food_delivery" },
    { id: "t2", cardAccountId: "axis", date: "2026-10-05", merchant: "ZOMATO", amount: 900, direction: "debit", kind: "purchase", category: "food_delivery" },
  ],
  statements: [],
  catalogue: [],
  heldTerms: [ace],
  nudges: [],
};
const tool = (name: string, onProposal?: (p: unknown) => void) => createMoneyTools(ctx, onProposal).find((t) => t.name === name)!;
const run = (name: string, input: unknown, onProposal?: (p: unknown) => void) => tool(name, onProposal).handler(input as never, { userId: "u", task: "t", runId: "r" });

describe("money tools (§8)", () => {
  it("getTransactions filters, counts and totals, exposing merchant not raw text", async () => {
    const out = (await run("getTransactions", { category: "food_delivery", minAmount: 1000 })) as { count: number; debitTotal: number; rows: { merchant: string }[] };
    expect(out).toMatchObject({ count: 1, debitTotal: 4100 });
    expect(JSON.stringify(out)).not.toContain("BANGALORE");
  });

  it("utilisation tools use finance-engine numbers", async () => {
    expect(await run("amountToReachUtilisation", { cardAccountId: "axis", targetPct: 30 })).toMatchObject({ nowPct: 74, payAmount: 22000 });
    expect(await run("utilizationImpact", { cardAccountId: "axis", amount: -12000 })).toMatchObject({ afterPct: 50 });
    expect(await run("bestCardFor", { category: "bills", amount: 1000 })).toMatchObject({ name: "Axis Ace", reward: 50 });
  });

  it("proposals are level 3 and only prepare", async () => {
    expect(tool("proposeBudget").permission).toBe(3);
    expect(tool("getFinancialState").permission).toBe(1);
    const seen = vi.fn();
    expect(await run("proposeBudget", { categories: [{ category: "food_delivery", amount: 5000 }] }, seen)).toMatchObject({ proposed: true, needsYourConfirmation: true });
    expect(seen).toHaveBeenCalledWith({ kind: "budget", total: null, categories: { food_delivery: 5000 } });
  });

  it("allows one proposal per turn", async () => {
    const seen = vi.fn();
    const tools = createMoneyTools(ctx, seen);
    const budget = tools.find((t) => t.name === "proposeBudget")!;
    const goal = tools.find((t) => t.name === "proposeGoal")!;
    const c = { userId: "u", task: "t", runId: "r" };
    await budget.handler({ categories: [{ category: "food_delivery", amount: 5000 }] } as never, c);
    expect(await budget.handler({ categories: [{ category: "food_delivery", amount: 9000 }] } as never, c)).toMatchObject({ error: expect.stringMatching(/already made a proposal/) });
    expect(await goal.handler({ name: "x", target: 100 } as never, c)).toMatchObject({ error: expect.any(String) });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("money chat", () => {
  it("prompt carries the locked chat rules", () => {
    const p = systemPromptFor({ recommender: null, money: ctx, nudge: null });
    expect(p).toMatch(/Every ₹ figure must come from a tool result/);
    expect(p).toMatch(/Never advise on investments, loans, insurance/);
    expect(p).toMatch(/Never say a bill has been paid/);
    expect(systemPromptFor({ recommender: null, money: null })).toMatch(/hasn't uploaded a statement/);
  });

  it("falls back to state numbers without Gemini", async () => {
    const a = await chatTurn({ userId: "u", message: "where did my money go?", history: [], recommender: null, money: ctx, callModel: null });
    expect(a.source).toBe("fallback_template");
    expect(a.text).toContain("₹37,000");
    expect(moneyFallback({ userId: "u", message: "x", history: [], recommender: null, money: ctx, callModel: null, nudge: { id: "n", ruleId: "due_today", title: "T", body: "Your Axis Ace bill (₹37,000) is due today.", payload: {}, why: { ruleId: "due_today", description: "", figures: [], dataDate: null } } })).toMatch(/^Your Axis Ace bill/);
  });
});

it("every money tool's input converts to a Gemini tool schema", async () => {
  const { zodToToolSchema } = await import("@perq/ai");
  for (const t of createMoneyTools(ctx)) expect(() => zodToToolSchema(t.input)).not.toThrow();
});

import { describe, expect, it } from "vitest";
import { reconcile, reconcileTolerance } from "../src";

const base = {
  previousBalance: 10000,
  paymentsCredits: 10000,
  purchasesDebits: 5000,
  feesCharges: 590,
  financeCharges: 0,
  totalDue: 5590,
  transactions: [
    { amount: 3000, direction: "debit" as const },
    { amount: 2000, direction: "debit" as const },
    { amount: 500, direction: "debit" as const },
    { amount: 90, direction: "debit" as const },
    { amount: 10000, direction: "credit" as const },
  ],
};

describe("reconcile (§5.4)", () => {
  it("passes a statement whose summary and lines add up", () => {
    const r = reconcile(base);
    expect(r.reconciled).toBe(true);
    expect(r.summary).toMatchObject({ ok: true, expectedTotal: 5590, diff: 0 });
    expect(r.lines).toMatchObject({ ok: true, debitSum: 5590, creditSum: 10000 });
  });

  it("fails when the summary doesn't add up, naming the figures", () => {
    const r = reconcile({ ...base, totalDue: 6590 });
    expect(r.reconciled).toBe(false);
    expect(r.summary.ok).toBe(false);
    expect(r.issues[0]).toMatch(/doesn't add up.*5590.*6590/);
  });

  it("fails when transaction lines don't match the summary (a missed line)", () => {
    const r = reconcile({ ...base, transactions: base.transactions.slice(1) });
    expect(r.reconciled).toBe(false);
    expect(r.summary.ok).toBe(true);
    expect(r.lines.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/Debit lines sum to 2590/);
  });

  it("tolerance is max(₹5, 0.1% of total due), inclusive at the edge", () => {
    expect(reconcileTolerance(1000)).toBe(5);
    expect(reconcileTolerance(200000)).toBe(200);
    // ₹5,590 due → tolerance max(5, 5.59) = 5.59
    expect(reconcile({ ...base, totalDue: 5595.59 }).summary.ok).toBe(true);
    expect(reconcile({ ...base, totalDue: 5595.7 }).summary.ok).toBe(false);
    const big = { ...base, previousBalance: 300000, paymentsCredits: 100000, transactions: [...base.transactions.slice(0, 4), { amount: 100000, direction: "credit" as const }], totalDue: 205590 };
    expect(reconcile({ ...big, totalDue: 205590 + 205 }).summary.ok).toBe(true); // within 0.1%
    expect(reconcile({ ...big, totalDue: 205590 + 207 }).summary.ok).toBe(false);
  });

  it("treats unprinted fees/finance charges as zero but missing core figures as unreconciled", () => {
    expect(reconcile({ ...base, feesCharges: null, transactions: base.transactions.filter((t) => t.amount !== 500 && t.amount !== 90), totalDue: 5000 }).reconciled).toBe(true);
    const r = reconcile({ ...base, totalDue: null });
    expect(r.reconciled).toBe(false);
    expect(r.issues[0]).toMatch(/Missing summary figures: totalDue/);
  });
});

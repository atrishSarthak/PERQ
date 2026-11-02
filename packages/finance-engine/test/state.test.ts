import { describe, expect, it } from "vitest";
import {
  amountToReachUtilisation,
  bestCardFor,
  chargesByMonth,
  buildFinancialState,
  istDate,
  utilisationAfter,
  type CardTerms,
  type StateInput,
  type StateStatement,
  type StateTransaction,
} from "../src";

const ace: CardTerms = { id: "axis-ace", name: "Axis Ace", rewardRates: { food_delivery: 4, bills: 5, other: 1.5 }, redemptionValue: null, feeWaiverSpend: 200000, annualFee: 499 };
const millennia: CardTerms = { id: "hdfc-millennia", name: "HDFC Millennia", rewardRates: { food_delivery: 5, online_shopping: 5, other: 1 }, redemptionValue: 0.25, feeWaiverSpend: 100000, annualFee: 1000 };

const stmt = (p: Partial<StateStatement> & { id: string; cardAccountId: string; statementDate: string }): StateStatement => ({
  dueDate: null, totalDue: null, minimumDue: null, previousBalance: null, paymentsCredits: null, feesCharges: null, financeCharges: null,
  creditLimit: null, pointsClosing: null, pointsExpiring: null, pointsExpiryDate: null, reconciled: true, markedPaidAt: null, ...p,
});
const txn = (p: Partial<StateTransaction> & { cardAccountId: string; statementId: string; txnDate: string; amount: number }): StateTransaction => ({
  id: `t-${p.statementId}-${p.txnDate}-${p.amount}`, direction: "debit", kind: "purchase", category: "food_delivery", merchant: "SWIGGY", description: "SWIGGY", ...p,
});

function base(now = "2026-11-12T06:00:00Z"): StateInput {
  return {
    now: new Date(now),
    cardAccounts: [
      { id: "a1", label: "HDFC Millennia", last4: "4821", issuer: "HDFC Bank", creditLimit: 100000, feeAnniversaryMonth: 3, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: millennia },
      { id: "a2", label: "Axis Ace", last4: "0093", issuer: "Axis Bank", creditLimit: 50000, feeAnniversaryMonth: null, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: ace },
    ],
    statements: [
      stmt({ id: "s1", cardAccountId: "a1", statementDate: "2026-10-15", dueDate: "2026-11-14", totalDue: 18240, minimumDue: 912, creditLimit: 100000, pointsClosing: 4200, pointsExpiring: 400, pointsExpiryDate: "2026-12-01" }),
      stmt({ id: "s0", cardAccountId: "a1", statementDate: "2026-09-15", dueDate: "2026-10-03", totalDue: 9000 }),
      stmt({ id: "s2", cardAccountId: "a2", statementDate: "2026-11-05", dueDate: "2026-11-23", totalDue: 37000, minimumDue: 1850, financeCharges: 0 }),
    ],
    transactions: [
      txn({ cardAccountId: "a1", statementId: "s1", txnDate: "2026-10-02", amount: 2000, category: "bills", merchant: "AIRTEL" }),
      txn({ cardAccountId: "a1", statementId: "s1", txnDate: "2026-10-10", amount: 590, kind: "fee", category: "fees_interest", description: "LATE PAYMENT FEE" }),
      txn({ cardAccountId: "a2", statementId: "s2", txnDate: "2026-11-01", amount: 3000, category: "food_delivery" }),
      txn({ cardAccountId: "a2", statementId: "s2", txnDate: "2026-11-02", amount: 1000, category: "groceries", merchant: "BLINKIT" }),
      txn({ cardAccountId: "a2", statementId: "s2", txnDate: "2026-11-03", amount: 400, direction: "credit", kind: "refund", category: "groceries" }),
      txn({ cardAccountId: "a2", statementId: "s2", txnDate: "2026-11-03", amount: 37000, direction: "credit", kind: "payment", category: "transfers" }),
    ],
    budget: { totalLimit: 20000, categoryLimits: { food_delivery: 5000 } },
    goals: [{ id: "g1", name: "Goa trip", targetAmount: 30000, targetDate: "2027-05-12", savedAmount: 3000, status: "active", createdAt: "2026-05-12" }],
  };
}

describe("buildFinancialState (§6)", () => {
  it("dues: latest statement per card, days to due in IST, totals over unpaid dues", () => {
    const s = buildFinancialState(base());
    const hdfc = s.cards.find((c) => c.cardAccountId === "a1")!;
    expect(hdfc.latestStatement).toMatchObject({ id: "s1", totalDue: 18240, dueDate: "2026-11-14" });
    expect(hdfc.daysToDue).toBe(2);
    expect(s.totals.totalDueAll).toBe(18240 + 37000);
    expect(s.dataThrough).toBe("2026-11-05");
  });

  it("marked paid: flag set and excluded from the total due", () => {
    const i = base();
    i.statements[0]!.markedPaidAt = "2026-11-12T05:00:00Z";
    const s = buildFinancialState(i);
    expect(s.cards[0]!.isPaidMarked).toBe(true);
    expect(s.totals.totalDueAll).toBe(37000);
  });

  it("utilisation uses the statement balance, or a balance override only when newer than the statement", () => {
    expect(buildFinancialState(base()).cards[0]).toMatchObject({ balanceForUtilisation: 18240, utilisationPct: 18.2, balanceSource: "statement" });
    const newer = base();
    Object.assign(newer.cardAccounts[0]!, { currentBalanceOverride: 74000, currentBalanceUpdatedAt: "2026-11-10T10:00:00Z" });
    expect(buildFinancialState(newer).cards[0]).toMatchObject({ balanceForUtilisation: 74000, utilisationPct: 74, balanceSource: "override" });
    const older = base();
    Object.assign(older.cardAccounts[0]!, { currentBalanceOverride: 74000, currentBalanceUpdatedAt: "2026-10-01T10:00:00Z" });
    expect(buildFinancialState(older).cards[0]!.balanceSource).toBe("statement");
  });

  it("next statement date and days to it", () => {
    expect(buildFinancialState(base()).cards[0]).toMatchObject({ nextStatementDate: "2026-11-15", daysToStatement: 3 });
  });

  it("points value = closing × the card's ₹ per point; no value when the card pays cashback", () => {
    expect(buildFinancialState(base()).cards[0]!.points).toEqual({ closing: 4200, valueRupees: 1050, expiring: 400, expiryDate: "2026-12-01" });
    expect(buildFinancialState(base()).cards[1]!.points).toBeNull();
  });

  it("fee-waiver pace since the anniversary month", () => {
    const fw = buildFinancialState(base()).cards[0]!.feeWaiver!;
    expect(fw).toMatchObject({ threshold: 100000, spentThisCardYear: 2000, remaining: 98000, cardYearEnds: "2027-03-01", onPace: false, startAssumed: false });
    expect(fw.monthsLeft).toBe(4);
  });

  it("fees last cycle lists fee and interest lines", () => {
    expect(buildFinancialState(base()).cards[0]!.feesLastCycle).toEqual({ total: 590, lines: [{ description: "LATE PAYMENT FEE", amount: 590 }] });
  });

  it("month spend counts purchases net of refunds, skips payments, and is honest about coverage", () => {
    const s = buildFinancialState(base());
    expect(s.month).toMatchObject({ key: "2026-11", totalSpend: 3600, coverage: "partial", leftToSpend: 16400, daysLeft: 19 });
    expect(s.month.spendByCategory).toEqual({ food_delivery: 3000, groceries: 600 });
    const later = buildFinancialState({ ...base("2026-10-31T10:00:00Z"), statements: [...base().statements, stmt({ id: "s9", cardAccountId: "a2", statementDate: "2026-11-05" })] });
    expect(later.month.coverage).toBe("complete");
  });

  it("best card in hindsight: extra reward a better held card would have earned last cycle", () => {
    const s = buildFinancialState(base());
    // Bills ₹2,000 on Millennia (no bills rate) vs Ace (5%): ₹100 more on Ace.
    expect(s.missedRewardsLastCycle.items).toContainEqual(expect.objectContaining({ txnId: "t-s1-2026-10-02-2000", usedCard: "HDFC Millennia", betterCard: "Axis Ace", extra: 100 }));
    // Food ₹3,000 on Ace (4%) vs Millennia (5%): ₹30 more on Millennia.
    expect(s.missedRewardsLastCycle.items).toContainEqual(expect.objectContaining({ usedCard: "Axis Ace", betterCard: "HDFC Millennia", extra: 30 }));
    // Groceries: neither card has a groceries rate, so nothing missed. Fees aren't purchases.
    expect(s.missedRewardsLastCycle.total).toBe(130);
  });

  it("goals: progress, monthly needed and how far behind plan", () => {
    const g = buildFinancialState(base()).goals[0]!;
    expect(g).toMatchObject({ target: 30000, saved: 3000, pctDone: 10, monthlyNeeded: 4500, expectedSaved: 15123, behindBy: 12123 }); // 184 of 365 days in
  });
});

describe("state helpers", () => {
  it("IST calendar date crosses midnight 5h30 before UTC", () => {
    expect(istDate(new Date("2026-11-13T18:29:00Z"))).toBe("2026-11-13");
    expect(istDate(new Date("2026-11-13T18:31:00Z"))).toBe("2026-11-14");
  });
  it("amountToReachUtilisation and utilisationAfter", () => {
    expect(amountToReachUtilisation(37000, 50000, 30)).toBe(22000);
    expect(amountToReachUtilisation(10000, 50000, 30)).toBe(0);
    expect(utilisationAfter(37000, 50000, -8000)).toBe(58);
  });
  it("bestCardFor picks the highest rate among held cards", () => {
    expect(bestCardFor("food_delivery", 1000, [ace, millennia])).toMatchObject({ cardId: "hdfc-millennia", ratePct: 5, reward: 50 });
    expect(bestCardFor("transfers", 1000, [ace])).toBeNull();
  });
});

describe("chargesByMonth", () => {
  const tx = (txnDate: string, amount: number, kind: string, category: string, direction: "debit" | "credit" = "debit") => ({ txnDate, amount, kind, category, direction });

  it("counts EMI, fees and purchases net of refunds, but not payments or transfers", () => {
    const c = chargesByMonth(
      [
        tx("2026-09-19", 18, "fee", "fees_interest"),
        tx("2026-10-15", 8509, "emi", "emi"),
        tx("2026-10-18", 7191, "emi", "emi"),
        tx("2026-10-19", 80, "interest", "emi"),
        tx("2026-10-02", 1480, "payment", "transfers", "credit"),
        tx("2026-10-05", 600, "purchase", "food_delivery"),
        tx("2026-10-06", 100, "refund", "food_delivery", "credit"),
        tx("2026-12-01", 999, "purchase", "travel"), // after the end month
      ],
      "2026-11"
    );
    expect(c.months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(c.months.map((m) => m.total)).toEqual([0, 0, 0, 18, 16280, 0]);
    expect(c.latest).toEqual({ key: "2026-10", total: 16280, byCategory: { emi: 15780, food_delivery: 500 } });
  });

  it("is empty without statements", () => {
    expect(chargesByMonth([], "2026-11").latest).toBeNull();
  });
});

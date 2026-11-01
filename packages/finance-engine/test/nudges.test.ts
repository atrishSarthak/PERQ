import { describe, expect, it } from "vitest";
import {
  buildFinancialState,
  evaluateRules,
  isQuietHours,
  nextSendTime,
  NUDGE_CONFIG,
  NUDGE_RULES,
  planNudges,
  type CardTerms,
  type NudgeCandidate,
  type NudgeHistoryEntry,
  type StateInput,
  type StateStatement,
  type StateTransaction,
  simulateUpcoming,
  validateNudgeCopy,
} from "../src";

const ace: CardTerms = { id: "axis-ace", name: "Axis Ace", rewardRates: { food_delivery: 4, bills: 5, other: 1.5 }, redemptionValue: null, feeWaiverSpend: 200000, annualFee: 499 };
const millennia: CardTerms = { id: "hdfc-millennia", name: "HDFC Millennia", rewardRates: { food_delivery: 5, online_shopping: 5, other: 1 }, redemptionValue: 0.25, feeWaiverSpend: 100000, annualFee: 1000 };

const st = (p: Partial<StateStatement> & { id: string; cardAccountId: string; statementDate: string }): StateStatement => ({
  dueDate: null, totalDue: null, minimumDue: null, previousBalance: 0, paymentsCredits: 0, feesCharges: 0, financeCharges: 0,
  creditLimit: null, pointsClosing: null, pointsExpiring: null, pointsExpiryDate: null, reconciled: true, markedPaidAt: null, ...p,
});
const tx = (p: Partial<StateTransaction> & { id: string; cardAccountId: string; statementId: string; txnDate: string; amount: number }): StateTransaction => ({
  direction: "debit", kind: "purchase", category: "food_delivery", merchant: "SWIGGY", description: "SWIGGY", ...p,
});

/** A state that makes every rule fire at 2026-11-12 10:00 IST. */
function input(over: (i: StateInput) => void = () => {}): StateInput {
  const i: StateInput = {
    now: new Date("2026-11-12T04:30:00Z"), // 10:00 IST
    cardAccounts: [
      { id: "hdfc", label: "HDFC Millennia", last4: "4821", issuer: "HDFC Bank", creditLimit: 50000, feeAnniversaryMonth: 3, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: millennia },
      { id: "axis", label: "Axis Ace", last4: "0093", issuer: "Axis Bank", creditLimit: 50000, feeAnniversaryMonth: 12, currentBalanceOverride: null, currentBalanceUpdatedAt: null, isActive: true, terms: ace },
    ],
    statements: [
      st({ id: "s-hdfc", cardAccountId: "hdfc", statementDate: "2026-10-15", dueDate: "2026-11-14", totalDue: 18240, minimumDue: 912, previousBalance: 12300, financeCharges: 1410, feesCharges: 590, pointsClosing: 4200, pointsExpiring: 400, pointsExpiryDate: "2026-12-20" }),
      st({ id: "s-axis", cardAccountId: "axis", statementDate: "2026-10-16", dueDate: "2026-11-12", totalDue: 37000, minimumDue: 1850 }),
    ],
    transactions: [
      tx({ id: "t1", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-02", amount: 6800, category: "bills", merchant: "AIRTEL" }),
      tx({ id: "t2", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-03", amount: 500, kind: "fee", category: "fees_interest", description: "LATE PAYMENT FEE" }),
      tx({ id: "t3", cardAccountId: "hdfc", statementId: "s-hdfc", txnDate: "2026-10-03", amount: 90, kind: "fee", category: "fees_interest", description: "IGST ON FEES" }),
      tx({ id: "t4", cardAccountId: "axis", statementId: "s-axis", txnDate: "2026-11-01", amount: 4100, category: "food_delivery" }),
      tx({ id: "t5", cardAccountId: "axis", statementId: "s-axis", txnDate: "2026-10-05", amount: 160000, category: "other", merchant: "BIG" }),
    ],
    budget: { totalLimit: null, categoryLimits: { food_delivery: 5000 } },
    goals: [{ id: "goa", name: "Goa trip fund", targetAmount: 30000, targetDate: "2027-05-12", savedAmount: 3000, status: "active", createdAt: "2026-05-12" }],
  };
  over(i);
  return i;
}

const run = (i: StateInput, history: NudgeHistoryEntry[] = []) => evaluateRules(buildFinancialState(i), i.now, history);
const byRule = (c: NudgeCandidate[], id: string) => c.filter((x) => x.ruleId === id);

describe("nudge rules (§7.2): each fires, doesn't fire, and keeps a stable dedupe key", () => {
  it("has exactly the 11 locked rules", () => {
    expect(NUDGE_RULES.map((r) => r.id).sort()).toEqual(
      ["budget_pace", "due_soon", "due_today", "fee_waiver_pace", "fees_charged", "goal_progress", "high_utilisation", "min_due_trap", "missed_rewards", "points_value", "statement_upload"].sort()
    );
  });

  it("due_soon: 1–3 days out, not paid", () => {
    const [n] = byRule(run(input()), "due_soon");
    expect(n).toMatchObject({ dedupeKey: "due_soon:hdfc:2026-10-15", priority: 90, payload: { totalDue: 18240, dueWeekday: "Saturday", daysToDue: 2 } });
    expect(n!.templateBody).toBe("Your HDFC Millennia bill of ₹18,240 is due on Saturday, 14 Nov.");
    expect(byRule(run(input((i) => (i.statements[0]!.markedPaidAt = "2026-11-11T00:00:00Z"))), "due_soon")).toHaveLength(0);
    expect(byRule(run(input((i) => (i.now = new Date("2026-11-05T04:30:00Z")))), "due_soon")).toHaveLength(0);
    expect(byRule(run(input((i) => (i.now = new Date("2026-11-11T04:30:00Z")))), "due_soon")[0]!.dedupeKey).toBe(n!.dedupeKey);
  });

  it("due_today", () => {
    expect(byRule(run(input()), "due_today")[0]).toMatchObject({ dedupeKey: "due_today:axis:2026-10-16", priority: 95, templateBody: "Your Axis Ace bill (₹37,000) is due today." });
    expect(byRule(run(input((i) => (i.statements[1]!.markedPaidAt = "2026-11-12T01:00:00Z"))), "due_today")).toHaveLength(0);
  });

  it("min_due_trap: interest charged on a carried balance, reconciled only", () => {
    expect(byRule(run(input()), "min_due_trap")[0]).toMatchObject({ priority: 85, templateBody: "You paid ₹1,410 in interest last cycle. Paying the full ₹18,240 avoids it." });
    expect(byRule(run(input((i) => (i.statements[0]!.financeCharges = 0))), "min_due_trap")).toHaveLength(0);
    expect(byRule(run(input((i) => (i.statements[0]!.reconciled = false))), "min_due_trap")).toHaveLength(0);
  });

  it("fees_charged: leads with a late fee; reconciled only", () => {
    expect(byRule(run(input()), "fees_charged")[0]).toMatchObject({ dedupeKey: "fees_charged:hdfc:2026-10-15", templateBody: "₹590 in fees on your HDFC Millennia statement, including a ₹500 late fee." });
    expect(byRule(run(input((i) => (i.statements[0]!.reconciled = false))), "fees_charged")).toHaveLength(0);
    expect(byRule(run(input((i) => (i.transactions = i.transactions.filter((t) => t.kind !== "fee")))), "fees_charged")).toHaveLength(0);
  });

  it("high_utilisation: warn at ≥70% close to statement (with ₹ to reach 30%), info at ≥30%", () => {
    // Axis: ₹37,000 of ₹50,000 = 74%, statement closes 16 Nov (4 days).
    const warn = byRule(run(input()), "high_utilisation").find((n) => n.cardAccountId === "axis")!;
    expect(warn).toMatchObject({ priority: 75, payload: { utilisationPct: 74, payToReach30: 22000, daysToStatement: 4, level: "warn" } });
    expect(warn.templateBody).toBe("You're at 74% of your limit and the statement closes in 4 days. Paying ₹22,000 brings it under 30%.");
    // HDFC: 36% → info.
    expect(byRule(run(input()), "high_utilisation").find((n) => n.cardAccountId === "hdfc")).toMatchObject({ priority: 40, payload: { level: "info" } });
    // A newer, lower balance the user typed wins over the statement.
    const lower = input((i) => Object.assign(i.cardAccounts[1]!, { currentBalanceOverride: 5000, currentBalanceUpdatedAt: "2026-11-11T10:00:00Z" }));
    expect(byRule(run(lower), "high_utilisation").find((n) => n.cardAccountId === "axis")).toBeUndefined();
  });

  it("statement_upload: 2+ days after the expected date with no newer statement", () => {
    expect(byRule(run(input()), "statement_upload")).toHaveLength(0); // HDFC next 15 Nov, Axis 16 Nov
    const late = byRule(run(input((i) => (i.now = new Date("2026-11-17T04:30:00Z")))), "statement_upload");
    expect(late.map((n) => n.dedupeKey)).toEqual(["statement_upload:hdfc:2026-11-15"]);
  });

  it("fee_waiver_pace: within 15% of the threshold, or behind with ≤ 4 months left", () => {
    // Axis: ₹1,64,100 of ₹2,00,000 spent (₹35,900 left = 18%) → not near; behind? anniversary Dec → 1 month left, projected short.
    const axis = byRule(run(input()), "fee_waiver_pace").find((n) => n.cardAccountId === "axis")!;
    expect(axis.payload).toMatchObject({ remaining: 35900, byMonth: "November", annualFee: 499 });
    expect(axis.templateBody).toBe("₹35,900 more spend by November waives the ₹499 fee.");
    // HDFC: ₹6,800 of ₹1,00,000 with 4 months left, far behind → fires too.
    expect(byRule(run(input()), "fee_waiver_pace").find((n) => n.cardAccountId === "hdfc")).toBeTruthy();
    expect(byRule(run(input((i) => (i.cardAccounts.forEach((a) => (a.terms = a.terms ? { ...a.terms, feeWaiverSpend: null } : null))))), "fee_waiver_pace")).toHaveLength(0);
  });

  it("missed_rewards: ≥ ₹100 more on a better held card; reconciled only", () => {
    // ₹6,800 bills on Millennia (0%) vs Ace (5%) = ₹340.
    const [n] = byRule(run(input()), "missed_rewards");
    expect(n).toMatchObject({ priority: 50, payload: { total: 340 + 41, topExtra: 340, betterCard: "Axis Ace", categoryLabel: "bills" } });
    expect(byRule(run(input((i) => i.statements.forEach((s) => (s.reconciled = false)))), "missed_rewards")).toHaveLength(0);
  });

  it("points_value: worth ≥ ₹500 or expiring; priority 65 when expiring within 60 days", () => {
    const [n] = byRule(run(input()), "points_value");
    expect(n).toMatchObject({ priority: 65, payload: { points: 4200, valueRupees: 1050 } });
    expect(n!.templateBody).toBe("4,200 points on your HDFC Millennia, worth about ₹1,050. 400 expire on 20 Dec.");
    const noExpiry = byRule(run(input((i) => Object.assign(i.statements[0]!, { pointsExpiring: null, pointsExpiryDate: null }))), "points_value")[0]!;
    expect(noExpiry.priority).toBe(45);
    expect(byRule(run(input((i) => Object.assign(i.statements[0]!, { pointsClosing: 1000, pointsExpiring: null }))), "points_value")).toHaveLength(0);
  });

  it("budget_pace: > 80% of a category budget with > 7 days left", () => {
    const [n] = byRule(run(input()), "budget_pace");
    expect(n).toMatchObject({ dedupeKey: "budget_pace:2026-11:food_delivery", templateBody: "Food delivery is at ₹4,100 of your ₹5,000 budget, with 19 days left." });
    expect(byRule(run(input((i) => (i.now = new Date("2026-11-26T04:30:00Z")))), "budget_pace")).toHaveLength(0);
    expect(byRule(run(input((i) => (i.budget = null))), "budget_pace")).toHaveLength(0);
  });

  it("goal_progress: > 15% behind its straight-line plan", () => {
    const [n] = byRule(run(input()), "goal_progress");
    expect(n).toMatchObject({ priority: 35, dedupeKey: "goal_progress:goa:2026-11" });
    expect(n!.templateBody).toMatch(/^Goa trip fund is ₹[\d,]+ behind plan\. ₹4,500 a month gets you there\.$/);
    expect(byRule(run(input((i) => (i.goals[0]!.savedAmount = 15000))), "goal_progress")).toHaveLength(0);
  });

  it("every candidate's template uses only numbers from its payload", () => {
    for (const c of run(input())) {
      const nums = new Set(Object.values(c.payload).flatMap((v) => (typeof v === "number" ? [v] : typeof v === "string" ? (v.match(/\d+/g) ?? []).map(Number) : [])));
      for (const m of `${c.templateTitle} ${c.templateBody}`.matchAll(/₹([\d,]+)/g)) {
        expect([c.ruleId, nums.has(Number(m[1]!.replace(/,/g, "")))]).toEqual([c.ruleId, true]);
      }
    }
  });
});

describe("planNudges (§7.1 steps 3–5)", () => {
  const now = new Date("2026-11-12T04:30:00Z"); // 10:00 IST
  const candidates = run(input());
  const hist = (p: Partial<NudgeHistoryEntry> & { ruleId: string; dedupeKey: string }): NudgeHistoryEntry => ({
    status: "sent", sentAt: null, dismissedAt: null, actedAt: null, createdAt: now.toISOString(), ...p,
  });

  it("sends at most 2 a day, highest priority first, and queues the rest for 09:00 IST tomorrow", () => {
    const p = planNudges({ candidates, queued: [], history: [], now });
    expect(p.sendFresh.map((c) => c.ruleId)).toEqual(["due_today", "due_soon"]);
    expect(p.queueFresh.length).toBe(candidates.length - 2);
    expect(p.queueFresh[0]!.scheduledFor).toBe("2026-11-13T03:30:00.000Z");
  });

  it("counts today's sends (IST day) against the cap", () => {
    const history = [hist({ ruleId: "x", dedupeKey: "x:1", sentAt: "2026-11-11T19:00:00Z" })]; // 00:30 IST on the 12th
    expect(planNudges({ candidates, queued: [], history, now }).sendFresh).toHaveLength(1);
    const yesterday = [hist({ ruleId: "x", dedupeKey: "x:1", sentAt: "2026-11-11T18:00:00Z" })]; // 23:30 IST on the 11th
    expect(planNudges({ candidates, queued: [], history: yesterday, now }).sendFresh).toHaveLength(2);
  });

  it("never sends during quiet hours (22:00–08:00 IST); holds until 09:00", () => {
    const late = new Date("2026-11-12T17:00:00Z"); // 22:30 IST
    expect(isQuietHours(late)).toBe(true);
    expect(isQuietHours(new Date("2026-11-12T02:00:00Z"))).toBe(true); // 07:30 IST
    expect(isQuietHours(now)).toBe(false);
    const p = planNudges({ candidates, queued: [], history: [], now: late });
    expect(p.sendFresh).toHaveLength(0);
    expect(p.queueFresh.every((q) => q.scheduledFor === "2026-11-13T03:30:00.000Z")).toBe(true);
    expect(nextSendTime(new Date("2026-11-12T02:00:00Z")).toISOString()).toBe("2026-11-12T03:30:00.000Z");
  });

  it("drops anything already seen (any status) and expired candidates", () => {
    const history = [hist({ ruleId: "due_today", dedupeKey: "due_today:axis:2026-10-16", status: "dismissed" })];
    const p = planNudges({ candidates, queued: [], history, now });
    expect([...p.sendFresh, ...p.queueFresh].some((c) => c.ruleId === "due_today")).toBe(false);
    const expired = planNudges({ candidates: [{ ...candidates[0]!, expiresAt: "2026-11-01T00:00:00Z" }], queued: [], history: [], now });
    expect(expired.sendFresh).toHaveLength(0);
  });

  it("learned suppression: 3 dismissals in 30 days without acting lowers a rule by 30", () => {
    const dismissed = [1, 2, 3].map((n) => hist({ ruleId: "due_today", dedupeKey: `old:${n}`, status: "dismissed", dismissedAt: "2026-11-01T00:00:00Z" }));
    const p = planNudges({ candidates, queued: [], history: dismissed, now });
    expect(p.sendFresh.map((c) => c.ruleId)).toEqual(["due_soon", "min_due_trap"]);
    const acted = [...dismissed, hist({ ruleId: "due_today", dedupeKey: "old:4", actedAt: "2026-11-05T00:00:00Z" })];
    expect(planNudges({ candidates, queued: [], history: acted, now }).sendFresh[0]!.ruleId).toBe("due_today");
  });

  it("previously queued nudges compete for today's slots and expire when stale", () => {
    const queued = [
      { id: "q1", ruleId: "due_today", dedupeKey: "due_today:other", priority: 99, expiresAt: "2026-11-20T00:00:00Z" },
      { id: "q2", ruleId: "points_value", dedupeKey: "pv:old", priority: 45, expiresAt: "2026-11-01T00:00:00Z" },
    ];
    const p = planNudges({ candidates, queued, history: [], now });
    expect(p.sendQueued.map((q) => q.id)).toEqual(["q1"]);
    expect(p.sendFresh).toHaveLength(1);
    expect(p.expire).toEqual(["q2"]);
  });

  it("config holds every threshold in one place", () => {
    expect(NUDGE_CONFIG.dailyCap).toBe(2);
  });
});

describe("nudge copy validation (§7.1 step 6)", () => {
  const [due] = byRule(run(input()), "due_soon");
  const tpl = { title: due!.templateTitle, body: due!.templateBody };

  it("every rule's own template passes", () => {
    for (const c of run(input())) expect([c.ruleId, validateNudgeCopy({ title: c.templateTitle, body: c.templateBody }, c.payload, { title: c.templateTitle, body: c.templateBody })]).toEqual([c.ruleId, { ok: true }]);
  });

  it("accepts a rewording that keeps the payload's numbers", () => {
    expect(validateNudgeCopy({ title: "HDFC Millennia bill on Saturday", body: "₹18,240 is due on 14 Nov. Paying it in full keeps interest away." }, due!.payload, tpl)).toEqual({ ok: true });
  });

  it("rejects invented numbers, shorthand amounts, urgency words and long text", () => {
    expect(validateNudgeCopy({ title: "Bill due", body: "₹18,000 is due on Saturday." }, due!.payload, tpl)).toMatchObject({ ok: false, reason: "number not in payload: 18000" });
    expect(validateNudgeCopy({ title: "Bill due", body: "About ₹18k is due on Saturday." }, due!.payload, tpl)).toMatchObject({ ok: false });
    expect(validateNudgeCopy({ title: "Pay now", body: "Hurry, ₹18,240 is due Saturday." }, due!.payload, tpl)).toMatchObject({ ok: false, reason: "banned word: hurry" });
    expect(validateNudgeCopy({ title: "Bill due!", body: "₹18,240 is due Saturday." }, due!.payload, tpl)).toMatchObject({ ok: false });
    expect(validateNudgeCopy({ title: "x", body: "a".repeat(161) }, due!.payload, tpl)).toMatchObject({ ok: false, reason: "body too long" });
  });
});

describe("simulateUpcoming (Expo Go local-notification fallback)", () => {
  it("plans the next days at 09:00 IST with the cap and without repeats", () => {
    const i = input((x) => (x.now = new Date("2026-11-10T14:00:00Z"))); // 19:30 IST on the 10th
    const up = simulateUpcoming(i, []);
    expect(up.every((u) => u.at.endsWith("T03:30:00.000Z"))).toBe(true);
    const perDay = new Map<string, number>();
    up.forEach((u) => perDay.set(u.at, (perDay.get(u.at) ?? 0) + 1));
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    expect(new Set(up.map((u) => u.dedupeKey)).size).toBe(up.length);
    expect(up[0]!.at).toBe("2026-11-11T03:30:00.000Z");
    // The 12 Nov due-today nudge for Axis lands on the 12th.
    expect(up.find((u) => u.ruleId === "due_today")?.at).toBe("2026-11-12T03:30:00.000Z");
  });

  it("skips anything already in history", () => {
    const i = input((x) => (x.now = new Date("2026-11-10T14:00:00Z")));
    const hist = [{ ruleId: "due_today", dedupeKey: "due_today:axis:2026-10-16", status: "dismissed", sentAt: null, dismissedAt: null, actedAt: null, createdAt: "2026-11-10T00:00:00Z" }];
    expect(simulateUpcoming(i, hist).some((u) => u.dedupeKey === "due_today:axis:2026-10-16")).toBe(false);
  });
});

describe("simulateUpcoming with stored queued nudges", () => {
  it("sends them on their day alongside fresh ones, within the cap", () => {
    const i = input((x) => (x.now = new Date("2026-11-10T14:00:00Z")));
    const stored = { id: "q1", ruleId: "fees_charged", dedupeKey: "stored:1", priority: 99, expiresAt: "2026-12-01T00:00:00Z", scheduledFor: "2026-11-11T03:30:00.000Z", title: "T", body: "B" };
    const up = simulateUpcoming(i, [{ ruleId: "fees_charged", dedupeKey: "stored:1", status: "queued", sentAt: null, dismissedAt: null, actedAt: null, createdAt: "2026-11-10T00:00:00Z" }], [stored]);
    expect(up.find((u) => u.dedupeKey === "stored:1")).toMatchObject({ at: "2026-11-11T03:30:00.000Z", title: "T" });
    expect(up.filter((u) => u.at === "2026-11-11T03:30:00.000Z")).toHaveLength(2);
  });
});

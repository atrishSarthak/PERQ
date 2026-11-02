import { eq } from "drizzle-orm";
import { budgets, cardAccounts, db, savingsGoals, statements, transactions, users } from "@perq/db";
import { PARSER_VERSION } from "@perq/statements";
import { insertDemoPlans } from "@/lib/plans/demo";
import { connectSwiggy } from "@/lib/swiggy/service";
import { setHeld } from "@/lib/recommender/service";
import { invalidateState, logActivity } from "./activity";
import { setDemoClock } from "./clock";
import { deleteFinancialData } from "./deleteData";
import { runNudgeEngine } from "./nudgeEngine";

// Demo mode (handoff §13.3). Two catalogue cards, three statements each
// (~120 transactions), a budget and a goal, all SYNTHETIC. On the demo date
// (22 Nov 2026, 09:00 IST) the real engine finds, from these rows alone:
//   - Axis ACE bill due in 2 days (statement 4 Nov, due 24 Nov)
//   - SimplyCLICK at 74% (₹37,000 balance entered 21 Nov, ₹50,000 limit), statement closes 26 Nov
//   - ₹340 missed rewards (a ₹7,158 bill on SimplyCLICK; ACE pays 4.75% more on bills)
//   - ₹590 fees (₹500 late fee + ₹90 GST) and 4,200 points ≈ ₹1,050 on SimplyCLICK
//   - food delivery ₹4,100 of a ₹5,000 budget with 8 days left
// Every other transaction is on the card that's already best for it.

export const DEMO_DATE = new Date("2026-11-22T03:30:00Z"); // 09:00 IST

type Txn = { date: string; desc: string; merchant: string; amount: number; category: string; kind?: string; direction?: "debit" | "credit" };

/** Deterministic pseudo-random so every demo load is identical. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACE_POOL: [string, string, string, number, number][] = [
  // desc, merchant, category, min, max
  ["SWIGGY BANGALORE IN", "SWIGGY", "food_delivery", 250, 650],
  ["ZOMATO GURGAON IN", "ZOMATO", "food_delivery", 220, 600],
  ["BIGBASKET BANGALORE", "BIGBASKET", "groceries", 600, 2200],
  ["ZEPTO MARKETPLACE", "ZEPTO", "groceries", 300, 900],
  ["THIRD WAVE COFFEE", "THIRD WAVE COFFEE", "dining", 280, 650],
  ["BARBEQUE NATION", "BARBEQUE NATION", "dining", 1400, 2600],
  ["UBER INDIA", "UBER", "travel", 180, 520],
  ["BOOKMYSHOW", "BOOKMYSHOW", "entertainment", 400, 1100],
  ["APOLLO PHARMACY", "APOLLO PHARMACY", "health", 250, 1300],
  ["BESCOM BILLDESK", "BESCOM", "bills", 900, 1800],
];
const CLICK_POOL: [string, string, string, number, number][] = [
  ["AMAZON PAY INDIA", "AMAZON", "online_shopping", 400, 3500],
  ["FLIPKART INTERNET", "FLIPKART", "online_shopping", 500, 4200],
  ["MYNTRA DESIGNS", "MYNTRA", "online_shopping", 900, 2800],
  ["NYKAA E RETAIL", "NYKAA", "online_shopping", 450, 1800],
];

function cycleTxns(pool: typeof ACE_POOL, start: string, end: string, n: number, seed: number): Txn[] {
  const r = rng(seed);
  const s = Date.parse(`${start}T00:00:00Z`);
  const days = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - s) / 86_400_000));
  return Array.from({ length: n }, () => {
    const [desc, merchant, category, min, max] = pool[Math.floor(r() * pool.length)]!;
    const date = new Date(s + Math.floor(r() * days) * 86_400_000).toISOString().slice(0, 10);
    return { date, desc, merchant, category, amount: Math.round((min + r() * (max - min)) / 10) * 10 };
  });
}

interface Cycle {
  statementDate: string;
  periodStart: string;
  dueDate: string;
  txns: Txn[];
  points?: { opening: number; earned: number; closing: number; expiring: number; expiryDate: string };
  /** Bill marked paid by the user (all but ACE's current one). */
  unpaid?: boolean;
}

function aceCycles(): Cycle[] {
  // Cycles end on the 4th. The latest (5 Oct–4 Nov) carries this month's food orders.
  const oct: Txn[] = [
    ...cycleTxns(ACE_POOL.filter(([, , c]) => c !== "food_delivery"), "2026-10-05", "2026-10-31", 14, 11),
    { date: "2026-11-01", desc: "SWIGGY BANGALORE IN", merchant: "SWIGGY", amount: 1240, category: "food_delivery" },
    { date: "2026-11-02", desc: "ZOMATO GURGAON IN", merchant: "ZOMATO", amount: 860, category: "food_delivery" },
    { date: "2026-11-03", desc: "SWIGGY INSTAMART", merchant: "SWIGGY", amount: 1180, category: "food_delivery" },
    { date: "2026-11-04", desc: "ZOMATO GURGAON IN", merchant: "ZOMATO", amount: 820, category: "food_delivery" },
    { date: "2026-11-02", desc: "BIGBASKET BANGALORE", merchant: "BIGBASKET", amount: 1640, category: "groceries" },
    { date: "2026-11-03", desc: "UBER INDIA", merchant: "UBER", amount: 340, category: "travel" },
  ];
  return [
    { statementDate: "2026-09-04", periodStart: "2026-08-05", dueDate: "2026-09-24", txns: cycleTxns(ACE_POOL, "2026-08-05", "2026-09-04", 20, 7) },
    { statementDate: "2026-10-04", periodStart: "2026-09-05", dueDate: "2026-10-24", txns: cycleTxns(ACE_POOL, "2026-09-05", "2026-10-04", 20, 9) },
    { statementDate: "2026-11-04", periodStart: "2026-10-05", dueDate: "2026-11-24", txns: oct, unpaid: true },
  ];
}

function clickCycles(): Cycle[] {
  return [
    { statementDate: "2026-08-26", periodStart: "2026-07-27", dueDate: "2026-09-15", txns: cycleTxns(CLICK_POOL, "2026-07-27", "2026-08-26", 18, 21), points: { opening: 2400, earned: 600, closing: 3000, expiring: 0, expiryDate: "2026-12-31" } },
    { statementDate: "2026-09-26", periodStart: "2026-08-27", dueDate: "2026-10-16", txns: cycleTxns(CLICK_POOL, "2026-08-27", "2026-09-26", 18, 23), points: { opening: 3000, earned: 650, closing: 3650, expiring: 0, expiryDate: "2026-12-31" } },
    {
      statementDate: "2026-10-26",
      periodStart: "2026-09-27",
      dueDate: "2026-11-15",
      txns: [
        ...cycleTxns(CLICK_POOL, "2026-09-27", "2026-10-26", 16, 25),
        { date: "2026-10-12", desc: "AIRTEL POSTPAID BILLDESK", merchant: "AIRTEL", amount: 7158, category: "bills" },
        { date: "2026-10-17", desc: "LATE PAYMENT FEE", merchant: "LATE PAYMENT FEE", amount: 500, category: "fees_interest", kind: "fee" },
        { date: "2026-10-17", desc: "IGST ON LATE PAYMENT FEE", merchant: "IGST", amount: 90, category: "fees_interest", kind: "fee" },
      ],
      points: { opening: 3650, earned: 550, closing: 4200, expiring: 400, expiryDate: "2026-12-31" },
    },
  ];
}

async function insertCard(
  userId: string,
  a: { issuer: string; last4: string; cardId: string; label: string; limit: number; statementDay: number; dueDay: number; anniversary: number; balance?: { amount: number; at: Date } },
  cycles: Cycle[]
) {
  const [acct] = await db
    .insert(cardAccounts)
    .values({
      userId, issuer: a.issuer, last4: a.last4, cardId: a.cardId, cardLabel: a.label, creditLimit: a.limit,
      statementDay: a.statementDay, dueDay: a.dueDay, feeAnniversaryMonth: a.anniversary,
      currentBalanceOverride: a.balance?.amount ?? null, currentBalanceUpdatedAt: a.balance?.at ?? null,
    })
    .returning({ id: cardAccounts.id });
  let previous = 0;
  let count = 0;
  for (const c of cycles) {
    const purchases = c.txns.filter((t) => (t.kind ?? "purchase") === "purchase").reduce((s, t) => s + t.amount, 0);
    const fees = c.txns.filter((t) => t.kind === "fee").reduce((s, t) => s + t.amount, 0);
    // The previous bill was paid in full, so it nets out; totals reconcile by construction.
    const payment = previous;
    const totalDue = previous - payment + purchases + fees;
    const [st] = await db
      .insert(statements)
      .values({
        userId, cardAccountId: acct!.id, statementDate: c.statementDate, periodStart: c.periodStart, periodEnd: c.statementDate, dueDate: c.dueDate,
        totalDue, minimumDue: Math.max(200, Math.round(totalDue * 0.05)), previousBalance: previous, paymentsCredits: payment, purchasesDebits: purchases,
        feesCharges: fees, financeCharges: 0, creditLimit: a.limit, availableLimit: a.limit - totalDue,
        pointsOpening: c.points?.opening ?? null, pointsEarned: c.points?.earned ?? null, pointsRedeemed: c.points ? 0 : null, pointsClosing: c.points?.closing ?? null,
        pointsExpiring: c.points?.expiring || null, pointsExpiryDate: c.points?.expiring ? c.points.expiryDate : null,
        reconciled: true, reconcileDiff: 0, parserVersion: `demo-${PARSER_VERSION}`, model: "demo",
        markedPaidAt: c.unpaid ? null : new Date(`${c.dueDate}T06:00:00Z`),
      })
      .returning({ id: statements.id });
    const rows = [
      ...(payment ? [{ date: c.periodStart, desc: "PAYMENT RECEIVED THANK YOU", merchant: "PAYMENT", amount: payment, category: "transfers", kind: "payment", direction: "credit" as const }] : []),
      ...c.txns,
    ];
    await db.insert(transactions).values(
      rows.map((t) => ({
        userId, statementId: st!.id, cardAccountId: acct!.id, txnDate: t.date, descriptionRaw: t.desc, merchantNormalized: t.merchant,
        amount: t.amount, direction: t.direction ?? "debit", kind: t.kind ?? "purchase", category: t.category, categorySource: "rule", isInternational: false,
      }))
    );
    count += rows.length;
    previous = totalDue;
  }
  return { id: acct!.id, count };
}

/** Replace the user's financial data with the demo set and set their clock to the demo date. */
export async function loadDemo(userId: string, at: Date = DEMO_DATE) {
  await deleteFinancialData(userId);
  await db.update(users).set({ isDemo: true }).where(eq(users.id, userId));
  await setDemoClock(userId, at);

  const ace = await insertCard(userId, { issuer: "Axis Bank", last4: "0093", cardId: "axis-ace", label: "Axis ACE", limit: 100000, statementDay: 4, dueDay: 24, anniversary: 6 }, aceCycles());
  const click = await insertCard(
    userId,
    { issuer: "SBI Card", last4: "7710", cardId: "sbi-simplyclick", label: "SimplyCLICK", limit: 50000, statementDay: 26, dueDay: 15, anniversary: 3, balance: { amount: 37000, at: new Date("2026-11-21T08:00:00Z") } },
    clickCycles()
  );
  // Step 3: an HDFC card for the phone offer. No statements yet (added last week), so its balance is entered.
  // Regalia Gold earns 0.5% everywhere, so it never changes the Step 2 missed-rewards story above.
  await insertCard(
    userId,
    { issuer: "HDFC Bank", last4: "4421", cardId: "hdfc-regalia-gold", label: "Regalia Gold", limit: 150000, statementDay: 25, dueDay: 14, anniversary: 9, balance: { amount: 8000, at: new Date("2026-11-20T08:00:00Z") } },
    []
  );
  await setHeld(userId, "axis-ace", true);
  await setHeld(userId, "sbi-simplyclick", true);
  await setHeld(userId, "hdfc-regalia-gold", true);
  await db.insert(budgets).values({ userId, month: null, totalLimit: 28000, categoryLimits: { food_delivery: 5000, online_shopping: 8000 } });
  await db.insert(savingsGoals).values({ userId, name: "Goa trip fund", targetAmount: 30000, targetDate: "2027-05-12", savedAmount: 3000, createdAt: new Date("2026-05-12T06:00:00Z") });
  await invalidateState(userId);
  await logActivity(userId, "demo_loaded", `Loaded demo data: 3 cards, 6 statements, 3 purchase plans, ${ace.count + click.count} transactions`);
  const plans = await insertDemoPlans(userId, at);
  // Step 4: mock Swiggy (always mock for the demo), so the Home card and the late-night nudge show.
  await connectSwiggy(userId, at, "mock");
  const run = await runNudgeEngine(userId, at);
  return { cards: 3, plans: plans.length, statements: 6, transactions: ace.count + click.count, nudgesSent: run.sent.length, now: at.toISOString() };
}

export async function resetDemo(userId: string) {
  await deleteFinancialData(userId);
  await db.update(users).set({ isDemo: false, demoClockOffsetMs: null }).where(eq(users.id, userId));
}

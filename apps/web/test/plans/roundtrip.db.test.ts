// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// API round trip (Step 3 §11): run → save → what-if → remind → statement match,
// through the real route handlers and database, on a throwaway demo user.
// The statement "parser" is mocked by inserting the rows a parse would confirm,
// and Gemini is off, so the template wording is what's checked.
// Runs only with a database: `pnpm --filter web test:db` (loads .env).

vi.mock("@/auth", () => ({ auth: async () => null }));

const enabled = !!process.env.DATABASE_URL && process.env.PERQ_DB_TESTS === "1";

describe.skipIf(!enabled)("plans API round trip", () => {
  let userId = "";
  let token = "";
  // Loaded lazily: importing @perq/db needs DATABASE_URL.
  let m: Awaited<ReturnType<typeof load>>;
  const load = async () => ({
    db: await import("@perq/db"),
    orm: await import("drizzle-orm"),
    demo: await import("@/lib/money/demo"),
    clock: await import("@/lib/money/clock"),
    match: await import("@/lib/plans/match"),
    run: await import("@/app/api/plans/run/route"),
    plan: await import("@/app/api/plans/[id]/route"),
    whatIf: await import("@/app/api/plans/[id]/what-if/route"),
    matchRoute: await import("@/app/api/plans/[id]/match/route"),
    jwt: await import("@/lib/mobileJwt"),
  });

  const req = (method: string, body?: unknown) =>
    new Request("http://test/api", { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    process.env.GEMINI_DISABLED = "1";
    m = await load();
    const [u] = await m.db.db.insert(m.db.users).values({ email: `roundtrip-${Date.now()}@test.perq` }).returning({ id: m.db.users.id });
    userId = u!.id;
    token = await m.jwt.signMobileToken(userId);
    await m.demo.loadDemo(userId);
  }, 60_000);

  afterAll(async () => {
    if (userId) await m.db.db.delete(m.db.users).where(m.orm.eq(m.db.users.id, userId));
  });

  it("runs, saves, what-ifs, reminds and matches a statement purchase", async () => {
    // 1. Run a confirmed plan: narration steps, then the plan event.
    const input = {
      item: { name: "Sony headphones", category: "online_shopping" },
      price: 29990,
      merchant: "Flipkart",
      needBy: "2026-12-04",
      offers: [{ type: "instant_discount", bank: "HDFC", flat: 1000, rawText: "₹1,000 off on HDFC Bank cards" }],
      emiOptions: [],
    };
    const res = await m.run.POST(req("POST", { input, source: "typed" }));
    expect(res.status).toBe(200);
    const events = (await res.text())
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)));
    expect(events.filter((e) => e.type === "step").length).toBeGreaterThan(2);
    const planEvent = events.find((e) => e.type === "plan");
    expect(planEvent.explanationSource).toBe("template");
    expect(planEvent.result.recommended.label).toBe("Regalia Gold");
    expect(planEvent.result.recommended.effectivePrice).toBe(28990);
    const id: string = planEvent.planId;

    // 2. Saved as a draft; Save makes it planned.
    let detail = await (await m.plan.GET(req("GET"), params(id))).json();
    expect(detail.plan.status).toBe("draft");
    detail = await (await m.plan.PATCH(req("PATCH", { status: "planned" }), params(id))).json();
    expect(detail.plan.status).toBe("planned");

    // 3. What-if on another card: a fresh result, not saved.
    const ace = detail.plan.result.options.find((o: { label: string }) => o.label === "Axis ACE");
    const wi = await (await m.whatIf.POST(req("POST", { changes: { cardAccountId: ace.cardAccountId } }), params(id))).json();
    expect(wi.result.chosen.option.label).toBe("Axis ACE");
    const after = await (await m.plan.GET(req("GET"), params(id))).json();
    expect(after.plan.result.recommended.label).toBe("Regalia Gold");

    // 4. Remind on the best day.
    const day = detail.plan.result.recommended.purchaseDate;
    detail = await (await m.plan.PATCH(req("PATCH", { status: "reminder_set", remindAt: day }), params(id))).json();
    expect(detail.plan).toMatchObject({ status: "reminder_set", remindAt: day });

    // 5. A later statement holds the purchase (the rows a confirmed parse writes).
    const { db, cardAccounts, statements, transactions, nudges } = m.db;
    const { and, eq } = m.orm;
    const [hdfc] = await db.select().from(cardAccounts).where(and(eq(cardAccounts.userId, userId), eq(cardAccounts.cardLabel, "Regalia Gold")));
    const [st] = await db
      .insert(statements)
      .values({
        userId, cardAccountId: hdfc!.id, statementDate: "2026-12-25", periodStart: "2026-11-26", periodEnd: "2026-12-25", dueDate: "2027-01-14",
        totalDue: 28990, minimumDue: 1450, previousBalance: 0, paymentsCredits: 0, purchasesDebits: 28990, feesCharges: 0, financeCharges: 0,
        creditLimit: 150000, availableLimit: 121010, reconciled: true, reconcileDiff: 0, parserVersion: "test", model: "test",
      })
      .returning({ id: statements.id });
    const [txn] = await db
      .insert(transactions)
      .values({
        userId, statementId: st!.id, cardAccountId: hdfc!.id, txnDate: "2026-11-26", descriptionRaw: "FLIPKART INTERNET", merchantNormalized: "FLIPKART",
        amount: 28990, direction: "debit", kind: "purchase", category: "online_shopping", categorySource: "rule", isInternational: false,
      })
      .returning({ id: transactions.id });
    const now = new Date("2026-12-26T03:30:00Z");
    await m.clock.setDemoClock(userId, now);
    expect(await m.match.offerPlanMatches(userId, now)).toBeGreaterThanOrEqual(1);
    const offers = await db.select().from(nudges).where(and(eq(nudges.userId, userId), eq(nudges.ruleId, "plan_purchase_match")));
    const offer = offers.find((n) => n.dedupeKey.includes(id));
    expect(offer).toBeTruthy();

    // 6. The user's yes: bought, linked, with the outcome against the plan.
    const ok = await m.matchRoute.POST(req("POST", { transactionId: txn!.id }), params(id));
    expect(ok.status).toBe(200);
    detail = await (await m.plan.GET(req("GET"), params(id))).json();
    expect(detail.plan.status).toBe("bought");
    expect(detail.matchedTransaction.amount).toBe(28990);
    expect(detail.outcome.usedRecommendedCard).toBe(true);
  }, 60_000);
});

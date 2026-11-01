import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { budgets, db, statements, transactions } from "@perq/db";
import { averageMonthlySpend, istDate } from "@perq/finance-engine";
import { budgetPutSchema, TXN_CATEGORY_LABELS } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { nowFor } from "@/lib/money/clock";
import { afterMoneyWrite } from "@/lib/money/hooks";
import { getFinancialState } from "@/lib/money/state";

export const dynamic = "force-dynamic";

/** GET /api/budgets: this month's budget (or the recurring default), spend so far, and a prefill. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const now = await nowFor(auth.id);
  const month = istDate(now).slice(0, 7);
  const [rows, state, stmts, txns] = await Promise.all([
    db.select().from(budgets).where(and(eq(budgets.userId, auth.id), or(eq(budgets.month, month), isNull(budgets.month)))),
    getFinancialState(auth.id, now),
    db.select().from(statements).where(eq(statements.userId, auth.id)),
    db.select().from(transactions).where(eq(transactions.userId, auth.id)),
  ]);
  const b = rows.find((r) => r.month === month) ?? rows.find((r) => r.month === null) ?? null;
  const avg = averageMonthlySpend(stmts, txns);
  return NextResponse.json({
    month,
    budget: b ? { month: b.month, totalLimit: b.totalLimit, categoryLimits: b.categoryLimits as Record<string, number> } : null,
    spendByCategory: state.month.spendByCategory,
    suggested: avg.statementCount ? { perMonth: avg.perMonth, total: avg.total, statementCount: avg.statementCount } : null,
  });
}

/** PUT /api/budgets: save a month's budget or the recurring default. */
export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = budgetPutSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
  const { month, totalLimit, categoryLimits } = body.data;
  // Postgres treats NULL months as distinct, so the recurring default is upserted by hand.
  const [existing] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.userId, auth.id), month === null ? isNull(budgets.month) : eq(budgets.month, month)))
    .limit(1);
  if (existing) await db.update(budgets).set({ totalLimit, categoryLimits, updatedAt: new Date() }).where(eq(budgets.id, existing.id));
  else await db.insert(budgets).values({ userId: auth.id, month, totalLimit, categoryLimits });
  await invalidateState(auth.id);
  const n = Object.keys(categoryLimits).length;
  await logActivity(
    auth.id,
    "budget_set",
    `Set your ${month === null ? "monthly" : "this month's"} budget${n ? ` with ${n} categor${n === 1 ? "y" : "ies"}` : ""}${n === 1 ? ` (${TXN_CATEGORY_LABELS[Object.keys(categoryLimits)[0] as keyof typeof TXN_CATEGORY_LABELS]})` : ""}`
  );
  await afterMoneyWrite(auth.id, "budget_changed");
  return NextResponse.json({ ok: true });
}

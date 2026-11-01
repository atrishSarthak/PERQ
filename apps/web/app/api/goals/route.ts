import { NextResponse } from "next/server";
import { db, savingsGoals } from "@perq/db";
import { goalCreateSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { nowFor } from "@/lib/money/clock";
import { afterMoneyWrite } from "@/lib/money/hooks";
import { getFinancialState } from "@/lib/money/state";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Savings goals (handoff §10.7). The table is savings_goals because Feature 3
// already owns `goals` (DECISIONS); its /api/goals/submit route is unrelated.

/** GET /api/goals: goals with progress from the financial state. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const [rows, state] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.userId, auth.id)),
    getFinancialState(auth.id, await nowFor(auth.id)),
  ]);
  return NextResponse.json({
    goals: rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((g) => {
        const s = state.goals.find((x) => x.id === g.id);
        return {
          id: g.id, name: g.name, targetAmount: g.targetAmount, targetDate: g.targetDate, savedAmount: g.savedAmount, status: g.status,
          pctDone: s?.pctDone ?? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100)), monthlyNeeded: s?.monthlyNeeded ?? null, behindBy: s?.behindBy ?? 0,
        };
      }),
  });
}

/** POST /api/goals: create a goal (also how an Ember proposal is confirmed). */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = goalCreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
  const [g] = await db
    .insert(savingsGoals)
    .values({ userId: auth.id, name: body.data.name, targetAmount: body.data.targetAmount, targetDate: body.data.targetDate ?? null, savedAmount: body.data.savedAmount ?? 0 })
    .returning({ id: savingsGoals.id });
  await invalidateState(auth.id);
  await logActivity(auth.id, "goal_created", `Started the goal "${body.data.name}"`, { table: "savings_goals", id: g!.id });
  await afterMoneyWrite(auth.id, "goal_changed");
  return NextResponse.json({ ok: true, id: g!.id });
}

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { cardAccounts, db, statements } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/statements?cardAccountId=: statement history (summary figures). */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const cardAccountId = new URL(req.url).searchParams.get("cardAccountId");
  const rows = await db
    .select({ s: statements, label: cardAccounts.cardLabel, last4: cardAccounts.last4 })
    .from(statements)
    .innerJoin(cardAccounts, eq(cardAccounts.id, statements.cardAccountId))
    .where(and(eq(statements.userId, auth.id), cardAccountId ? eq(statements.cardAccountId, cardAccountId) : undefined))
    .orderBy(desc(statements.statementDate));
  return NextResponse.json({
    statements: rows.map(({ s, label, last4 }) => ({
      id: s.id,
      cardAccountId: s.cardAccountId,
      cardLabel: label,
      last4,
      statementDate: s.statementDate,
      dueDate: s.dueDate,
      totalDue: s.totalDue,
      minimumDue: s.minimumDue,
      reconciled: s.reconciled,
      markedPaid: !!s.markedPaidAt,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

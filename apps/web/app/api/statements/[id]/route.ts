import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, statements } from "@perq/db";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { afterMoneyWrite } from "@/lib/money/hooks";

export const dynamic = "force-dynamic";

/** DELETE /api/statements/:id: the statement and its transactions (cascade). Immediate. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const deleted = await db
    .delete(statements)
    .where(and(eq(statements.id, id), eq(statements.userId, auth.id)))
    .returning({ id: statements.id, date: statements.statementDate });
  if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await invalidateState(auth.id);
  await logActivity(auth.id, "statement_deleted", `Deleted the statement dated ${deleted[0]!.date}`);
  await afterMoneyWrite(auth.id, "statement_deleted");
  return NextResponse.json({ deleted: true });
}

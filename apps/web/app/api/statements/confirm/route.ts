import { NextResponse } from "next/server";
import { confirmStatementRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { confirmForUser, StatementError } from "@/lib/money/statementService";
import { afterMoneyWrite } from "@/lib/money/hooks";

export const dynamic = "force-dynamic";

/** POST /api/statements/confirm: save a reviewed draft with the user's edits. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const body = confirmStatementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const saved = await confirmForUser(auth.id, body.data);
    await afterMoneyWrite(auth.id, "statement_confirmed");
    return NextResponse.json(saved);
  } catch (err) {
    if (err instanceof StatementError) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    throw err;
  }
}

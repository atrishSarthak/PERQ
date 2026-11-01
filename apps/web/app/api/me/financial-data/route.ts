import { NextResponse } from "next/server";
import { isAuthed, requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/money/activity";
import { deleteFinancialData } from "@/lib/money/deleteData";

export const dynamic = "force-dynamic";

/** DELETE /api/me/financial-data (§10.9, §12): all financial data, immediately. Account and quiz answers stay. */
export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  await deleteFinancialData(auth.id);
  await logActivity(auth.id, "financial_data_deleted", "Deleted all your financial data");
  return NextResponse.json({ deleted: true });
}

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, transactions, userMerchantOverrides } from "@perq/db";
import { TXN_CATEGORY_LABELS, transactionPatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { afterMoneyWrite } from "@/lib/money/hooks";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/transactions/:id: recategorise. With rememberForMerchant (default)
 * the user's other transactions from that merchant follow, and future uploads
 * use it. The override is the user's own; the shared cache isn't touched (§5.5).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const body = transactionPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  const [txn] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, auth.id))).limit(1);
  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { category, rememberForMerchant } = body.data;

  let updated = 1;
  if (rememberForMerchant && txn.merchantNormalized) {
    await db
      .insert(userMerchantOverrides)
      .values({ userId: auth.id, merchantNormalized: txn.merchantNormalized, category })
      .onConflictDoUpdate({ target: [userMerchantOverrides.userId, userMerchantOverrides.merchantNormalized], set: { category, updatedAt: new Date() } });
    const rows = await db
      .update(transactions)
      .set({ category, categorySource: "user" })
      .where(and(eq(transactions.userId, auth.id), eq(transactions.merchantNormalized, txn.merchantNormalized), eq(transactions.kind, txn.kind)))
      .returning({ id: transactions.id });
    updated = rows.length;
  } else {
    await db.update(transactions).set({ category, categorySource: "user" }).where(eq(transactions.id, id));
  }
  await invalidateState(auth.id);
  await logActivity(auth.id, "recategorised", `Moved ${updated} transaction${updated === 1 ? "" : "s"} to ${TXN_CATEGORY_LABELS[category]}`, { table: "transactions", id });
  await afterMoneyWrite(auth.id, "budget_changed");
  return NextResponse.json({ ok: true, updated });
}

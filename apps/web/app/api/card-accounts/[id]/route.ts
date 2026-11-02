import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { cardAccounts, chatMessages, db, nudges, statements } from "@perq/db";
import { cardAccountPatchSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { invalidateState, logActivity } from "@/lib/money/activity";
import { afterMoneyWrite } from "@/lib/money/hooks";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { setHeld } from "@/lib/recommender/service";
import { cardAccountDetail } from "@/lib/money/accounts";
import { nowFor } from "@/lib/money/clock";
import { refreshSyncedSpend } from "@/lib/recommender/spendSync";

export const dynamic = "force-dynamic";

/** GET /api/card-accounts/:id: card detail (state, missed rewards, statement history). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const detail = await cardAccountDetail(auth.id, id, await nowFor(auth.id));
  return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** PATCH /api/card-accounts/:id: label, catalogue link, balance override, mark paid, days. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const body = cardAccountPatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });
  const [account] = await db.select().from(cardAccounts).where(and(eq(cardAccounts.id, id), eq(cardAccounts.userId, auth.id))).limit(1);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = body.data;

  if (p.catalogueCardId) {
    const known = (await loadCatalogue()).some((c) => c.id === p.catalogueCardId);
    if (!known) return NextResponse.json({ error: "Unknown card" }, { status: 400 });
  }
  const set: Partial<typeof cardAccounts.$inferInsert> = {};
  if (p.cardLabel !== undefined) set.cardLabel = p.cardLabel;
  if (p.catalogueCardId !== undefined) set.cardId = p.catalogueCardId;
  if (p.currentBalance !== undefined) {
    set.currentBalanceOverride = p.currentBalance;
    set.currentBalanceUpdatedAt = p.currentBalance === null ? null : new Date();
  }
  if (p.creditLimit !== undefined) set.creditLimit = p.creditLimit;
  if (p.statementDay !== undefined) set.statementDay = p.statementDay;
  if (p.dueDay !== undefined) set.dueDay = p.dueDay;
  if (p.isActive !== undefined) set.isActive = p.isActive;
  if (Object.keys(set).length) await db.update(cardAccounts).set(set).where(eq(cardAccounts.id, id));

  const events: string[] = [];
  if (p.markPaid !== undefined) {
    const [latest] = await db.select().from(statements).where(eq(statements.cardAccountId, id)).orderBy(desc(statements.statementDate)).limit(1);
    if (!latest) return NextResponse.json({ error: "Upload a statement for this card first." }, { status: 409 });
    await db.update(statements).set({ markedPaidAt: p.markPaid ? new Date() : null }).where(eq(statements.id, latest.id));
    events.push(p.markPaid ? `Marked your ${account.cardLabel} bill as paid` : `Marked your ${account.cardLabel} bill as not paid`);
  }
  if (p.catalogueCardId) await setHeld(auth.id, p.catalogueCardId, true);
  if (p.currentBalance !== undefined) events.push(`Updated the ${account.cardLabel} balance`);
  if (p.cardLabel !== undefined || p.catalogueCardId !== undefined) events.push(`Updated your ${p.cardLabel ?? account.cardLabel} card details`);

  await invalidateState(auth.id);
  for (const e of events) await logActivity(auth.id, "card_account_updated", e, { table: "card_accounts", id });
  await afterMoneyWrite(auth.id, p.markPaid !== undefined ? "marked_paid" : p.currentBalance !== undefined ? "balance_updated" : "statement_confirmed");
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/card-accounts/:id: removes the card from My cards with its statements and
 * transactions (cascade), its nudges and its Ember thread, and unticks "I have this card".
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const { id } = await params;
  const [account] = await db.select().from(cardAccounts).where(and(eq(cardAccounts.id, id), eq(cardAccounts.userId, auth.id))).limit(1);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(nudges).where(and(eq(nudges.userId, auth.id), eq(nudges.cardAccountId, id)));
  await db.delete(chatMessages).where(and(eq(chatMessages.userId, auth.id), eq(chatMessages.threadRef, `card:${id}`)));
  await db.delete(cardAccounts).where(eq(cardAccounts.id, id));
  // No other account is that card: it's no longer one you hold.
  if (account.cardId) {
    const [other] = await db.select({ id: cardAccounts.id }).from(cardAccounts).where(and(eq(cardAccounts.userId, auth.id), eq(cardAccounts.cardId, account.cardId))).limit(1);
    if (!other) await setHeld(auth.id, account.cardId, false);
  }
  await refreshSyncedSpend(auth.id);
  await invalidateState(auth.id);
  await logActivity(auth.id, "card_account_deleted", `Removed your ${account.cardLabel} card and its statements`);
  await afterMoneyWrite(auth.id, "statement_deleted");
  return NextResponse.json({ deleted: true });
}

import { and, eq, like } from "drizzle-orm";
import { cardAccounts, db, statements } from "@perq/db";
import type { CatalogCard } from "@perq/shared";
import { invalidateState, logActivity } from "./activity";

// "I have this card" in Explore adds the card to My cards as an account with
// no statement yet, so the planner, Home and Ember see it. Its last4 is a
// placeholder ("#<card id>"); the first statement for that card takes the
// account over and sets the real last4.

export const MANUAL_LAST4 = "#";
export const isManualLast4 = (last4: string) => last4.startsWith(MANUAL_LAST4);

export async function addHeldCardAccount(userId: string, card: CatalogCard): Promise<void> {
  const existing = await db.select({ id: cardAccounts.id }).from(cardAccounts).where(and(eq(cardAccounts.userId, userId), eq(cardAccounts.cardId, card.id))).limit(1);
  if (existing.length) return;
  await db
    .insert(cardAccounts)
    .values({ userId, cardId: card.id, issuer: card.issuer, cardLabel: card.name, last4: `${MANUAL_LAST4}${card.id}` })
    .onConflictDoNothing();
  await invalidateState(userId);
  await logActivity(userId, "card_account_added", `Added your ${card.name} to My cards`);
}

/** Turning "I have this card" off removes the card only while it has no statements. */
export async function removeHeldCardAccount(userId: string, cardId: string): Promise<void> {
  const manual = await db
    .select({ id: cardAccounts.id, label: cardAccounts.cardLabel })
    .from(cardAccounts)
    .where(and(eq(cardAccounts.userId, userId), eq(cardAccounts.cardId, cardId), like(cardAccounts.last4, `${MANUAL_LAST4}%`)));
  for (const a of manual) {
    const [stmt] = await db.select({ id: statements.id }).from(statements).where(eq(statements.cardAccountId, a.id)).limit(1);
    if (stmt) continue;
    await db.delete(cardAccounts).where(eq(cardAccounts.id, a.id));
    await logActivity(userId, "card_account_deleted", `Removed your ${a.label} from My cards`);
  }
  if (manual.length) await invalidateState(userId);
}

/**
 * A statement for a card added by hand: give that account the statement's issuer and
 * last4, so the statement's upsert lands on it instead of making a second account.
 */
export async function claimHeldCardAccount(userId: string, cardId: string | null, issuer: string, last4: string): Promise<void> {
  if (!cardId) return;
  const [manual] = await db
    .select({ id: cardAccounts.id })
    .from(cardAccounts)
    .where(and(eq(cardAccounts.userId, userId), eq(cardAccounts.cardId, cardId), like(cardAccounts.last4, `${MANUAL_LAST4}%`)))
    .limit(1);
  if (!manual) return;
  const [taken] = await db
    .select({ id: cardAccounts.id })
    .from(cardAccounts)
    .where(and(eq(cardAccounts.userId, userId), eq(cardAccounts.issuer, issuer), eq(cardAccounts.last4, last4)))
    .limit(1);
  if (taken) await db.delete(cardAccounts).where(eq(cardAccounts.id, manual.id));
  else await db.update(cardAccounts).set({ issuer, last4 }).where(eq(cardAccounts.id, manual.id));
}

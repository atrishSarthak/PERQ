import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { cardAccounts, db, nudges, purchasePlans, transactions, type PurchasePlanRow } from "@perq/db";
import { formatInr, istDate, matchDedupeKey, matchPlanPurchase, planOutcome, planPurchaseMatchCandidate } from "@perq/finance-engine";
import type { PlanResult } from "@perq/shared";
import { logActivity } from "@/lib/money/activity";

// Statement purchase matching (Step 3 §8). After a statement is confirmed,
// open plans are checked against its purchases; a likely match becomes an
// in-app nudge asking "did you buy this?". Only the user's yes links the
// transaction and closes the plan.

const MATCH_NUDGE_DAYS = 14;
const LOOKBACK_DAYS = 60;

export async function offerPlanMatches(userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const plans = await db
    .select()
    .from(purchasePlans)
    .where(
      and(
        eq(purchasePlans.userId, userId),
        inArray(purchasePlans.status, ["draft", "planned", "reminder_set"]),
        isNull(purchasePlans.matchedTransactionId),
        gte(purchasePlans.createdAt, since)
      )
    );
  if (!plans.length) return 0;
  const firstDay = plans.map((p) => istDate(p.createdAt)).sort()[0]!;
  const txns = await db
    .select({
      id: transactions.id,
      date: transactions.txnDate,
      merchant: transactions.merchantNormalized,
      amount: transactions.amount,
      direction: transactions.direction,
      kind: transactions.kind,
      category: transactions.category,
      cardAccountId: transactions.cardAccountId,
      cardLabel: cardAccounts.cardLabel,
    })
    .from(transactions)
    .innerJoin(cardAccounts, eq(cardAccounts.id, transactions.cardAccountId))
    .where(and(eq(transactions.userId, userId), gte(transactions.txnDate, firstDay)));

  // Newest plan first, and one statement line per plan.
  const used = new Set<string>();
  let offered = 0;
  for (const p of [...plans].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const result = p.result as PlanResult | null;
    const free = txns.filter((t) => !used.has(t.id)).map((t) => ({ ...t, direction: t.direction as "debit" | "credit", merchant: t.merchant ?? "" }));
    const hit = matchPlanPurchase(
      { id: p.id, price: p.price, effectivePrice: result?.recommended.effectivePrice ?? null, merchant: p.merchant, category: p.category, createdDay: istDate(p.createdAt) },
      free
    );
    if (!hit) continue;
    used.add(hit.id);
    const t = txns.find((x) => x.id === hit.id)!;
    const c = planPurchaseMatchCandidate({
      planId: p.id,
      itemName: p.itemName,
      transaction: { id: t.id, date: t.date, merchant: t.merchant ?? "the shop", amount: t.amount, cardAccountId: t.cardAccountId },
      cardLabel: t.cardLabel,
      expiresAt: new Date(now.getTime() + MATCH_NUDGE_DAYS * 86_400_000).toISOString(),
    });
    // In-app only (§8): stored as sent so it shows in the inbox, never pushed, not counted in the cap.
    const [row] = await db
      .insert(nudges)
      .values({
        userId,
        ruleId: c.ruleId,
        dedupeKey: c.dedupeKey,
        cardAccountId: c.cardAccountId ?? null,
        priority: c.priority,
        payload: c.payload,
        title: c.templateTitle,
        body: c.templateBody,
        bodySource: "template",
        why: c.why,
        status: "sent",
        sentAt: now,
        expiresAt: new Date(c.expiresAt),
      })
      .onConflictDoNothing()
      .returning({ id: nudges.id });
    if (row) offered++;
  }
  return offered;
}

export class PlanMatchError extends Error {}

/** The user's yes: link the statement line, mark the plan bought, and log how it went against the plan. */
export async function confirmPlanMatch(userId: string, plan: PurchasePlanRow, transactionId: string, now: Date): Promise<void> {
  const [t] = await db
    .select({ id: transactions.id, date: transactions.txnDate, amount: transactions.amount, cardAccountId: transactions.cardAccountId, cardLabel: cardAccounts.cardLabel })
    .from(transactions)
    .innerJoin(cardAccounts, eq(cardAccounts.id, transactions.cardAccountId))
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
    .limit(1);
  if (!t) throw new PlanMatchError("That purchase isn't on your statements.");
  await db
    .update(purchasePlans)
    .set({ status: "bought", matchedTransactionId: t.id, updatedAt: now })
    .where(and(eq(purchasePlans.id, plan.id), eq(purchasePlans.userId, userId)));
  await db
    .update(nudges)
    .set({ status: "acted", actedAt: now })
    .where(and(eq(nudges.userId, userId), eq(nudges.dedupeKey, matchDedupeKey(plan.id, t.id))));

  const result = plan.result as PlanResult | null;
  const o = result ? planOutcome(result, t) : null;
  const how = !o
    ? ""
    : o.usedRecommendedCard
      ? ` with your ${t.cardLabel}, as planned.${o.savedVsUpi ? ` Ember saved you ${formatInr(o.savedVsUpi)}.` : ""}`
      : ` with your ${t.cardLabel} (the plan said ${result!.recommended.label}).`;
  await logActivity(userId, "plan_bought_matched", `Bought the ${plan.itemName} for ${formatInr(t.amount)}${how}`, { table: "purchase_plans", id: plan.id });
}

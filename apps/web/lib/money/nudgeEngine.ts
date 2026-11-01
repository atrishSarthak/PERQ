import { and, eq, gte, inArray, or } from "drizzle-orm";
import { cardAccounts, db, nudges } from "@perq/db";
import {
  buildFinancialState,
  evaluateRules,
  planNudges,
  type NudgeCandidate,
  type NudgeHistoryEntry,
} from "@perq/finance-engine";
import { logActivity } from "./activity";
import { loadStateInput } from "./state";

// Server side of the nudge engine (handoff §7.1). Rules and planning are pure
// finance-engine code; this file only loads rows and saves the result.
// Copy is the rule's template here; Gemini wording + delivery come at checkpoint 9.

const HISTORY_DAYS = 120;

export interface NudgeRunResult {
  candidates: number;
  sent: string[];
  queued: number;
  expired: number;
  quietHours: boolean;
}

export async function runNudgeEngine(userId: string, now: Date = new Date()): Promise<NudgeRunResult> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  // Built fresh (not the per-day cache) so a write earlier today is reflected.
  const [input, rows] = await Promise.all([
    loadStateInput(userId, now),
    db.select().from(nudges).where(and(eq(nudges.userId, userId), or(gte(nudges.createdAt, since), eq(nudges.status, "queued")))),
  ]);
  const state = buildFinancialState(input);

  const history: NudgeHistoryEntry[] = rows.map((r) => ({
    ruleId: r.ruleId,
    dedupeKey: r.dedupeKey,
    status: r.status,
    sentAt: r.sentAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    actedAt: r.actedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  const due = rows.filter((r) => r.status === "queued" && (!r.scheduledFor || r.scheduledFor <= now));
  const candidates = evaluateRules(state, now, history);
  const plan = planNudges({
    candidates,
    queued: due.map((r) => ({ id: r.id, ruleId: r.ruleId, dedupeKey: r.dedupeKey, priority: r.priority, expiresAt: r.expiresAt?.toISOString() ?? null })),
    history,
    now,
  });

  const row = (c: NudgeCandidate, extra: { status: string; sentAt?: Date; scheduledFor?: Date }) => ({
    userId,
    ruleId: c.ruleId,
    dedupeKey: c.dedupeKey,
    cardAccountId: c.cardAccountId ?? null,
    priority: c.priority,
    payload: c.payload,
    title: c.templateTitle,
    body: c.templateBody,
    bodySource: "template",
    expiresAt: new Date(c.expiresAt),
    ...extra,
  });

  const sent: string[] = [];
  if (plan.sendFresh.length) {
    const inserted = await db
      .insert(nudges)
      .values(plan.sendFresh.map((c) => row(c, { status: "sent", sentAt: now })))
      .onConflictDoNothing()
      .returning({ id: nudges.id });
    sent.push(...inserted.map((r) => r.id));
  }
  if (plan.sendQueued.length) {
    const ids = plan.sendQueued.map((q) => q.id);
    await db.update(nudges).set({ status: "sent", sentAt: now }).where(and(eq(nudges.userId, userId), inArray(nudges.id, ids)));
    sent.push(...ids);
  }
  if (plan.queueFresh.length) {
    await db
      .insert(nudges)
      .values(plan.queueFresh.map((c) => row(c, { status: "queued", scheduledFor: new Date(c.scheduledFor) })))
      .onConflictDoNothing();
  }
  if (plan.expire.length) {
    await db.update(nudges).set({ status: "expired" }).where(and(eq(nudges.userId, userId), inArray(nudges.id, plan.expire)));
  }
  if (sent.length) {
    await logActivity(userId, "nudge_sent", sent.length === 1 ? "Sent you 1 nudge" : `Sent you ${sent.length} nudges`);
  }

  return { candidates: candidates.length, sent, queued: plan.queueFresh.length, expired: plan.expire.length, quietHours: plan.quietHours };
}

/** Users with any card account: the daily cron's work list. */
export async function nudgeUserIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: cardAccounts.userId }).from(cardAccounts).where(eq(cardAccounts.isActive, true));
  return rows.map((r) => r.userId);
}

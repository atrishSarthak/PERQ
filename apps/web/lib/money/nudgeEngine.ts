import { and, eq, gte, inArray, or } from "drizzle-orm";
import { cardAccounts, db, nudges } from "@perq/db";
import {
  buildFinancialState,
  evaluateRules,
  planNudges,
  simulateUpcoming,
  type NudgeCandidate,
  type NudgeHistoryEntry,
  type NudgePayload,
  type UpcomingNudge,
} from "@perq/finance-engine";
import { logActivity } from "./activity";
import { writeNudgeCopy } from "./nudgeCopy";
import { pushNudges } from "./push";
import { loadStateInput } from "./state";

// Server side of the nudge engine (handoff §7.1). Rules and planning are pure
// finance-engine code; this file only loads rows and saves the result.
// Copy is written (Gemini, validated, else template) only when a nudge is
// sent; queued rows hold the template until then.

const HISTORY_DAYS = 120;

export interface NudgeRunResult {
  candidates: number;
  sent: string[];
  queued: number;
  expired: number;
  quietHours: boolean;
}

async function loadHistory(userId: string, now: Date) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const rows = await db.select().from(nudges).where(and(eq(nudges.userId, userId), or(gte(nudges.createdAt, since), eq(nudges.status, "queued"))));
  const history: NudgeHistoryEntry[] = rows.map((r) => ({
    ruleId: r.ruleId,
    dedupeKey: r.dedupeKey,
    status: r.status,
    sentAt: r.sentAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    actedAt: r.actedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { rows, history };
}

export async function runNudgeEngine(userId: string, now: Date = new Date()): Promise<NudgeRunResult> {
  // Built fresh (not the per-day cache) so a write earlier today is reflected.
  const [input, { rows, history }] = await Promise.all([loadStateInput(userId, now), loadHistory(userId, now)]);
  const state = buildFinancialState(input);
  const due = rows.filter((r) => r.status === "queued" && (!r.scheduledFor || r.scheduledFor <= now));
  const candidates = evaluateRules(state, now, history);
  const plan = planNudges({
    candidates,
    queued: due.map((r) => ({ id: r.id, ruleId: r.ruleId, dedupeKey: r.dedupeKey, priority: r.priority, expiresAt: r.expiresAt?.toISOString() ?? null })),
    history,
    now,
  });

  const row = (c: NudgeCandidate, extra: { status: string; sentAt?: Date; scheduledFor?: Date; title?: string; body?: string; bodySource?: string }) => ({
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
    expiresAt: new Date(c.expiresAt),
    ...extra,
  });

  const sent: { id: string; title: string; body: string }[] = [];
  for (const c of plan.sendFresh) {
    const copy = await writeNudgeCopy(c);
    const [inserted] = await db
      .insert(nudges)
      .values(row(c, { status: "sent", sentAt: now, title: copy.title, body: copy.body, bodySource: copy.source }))
      .onConflictDoNothing()
      .returning({ id: nudges.id });
    if (inserted) sent.push({ id: inserted.id, title: copy.title, body: copy.body });
  }
  for (const q of plan.sendQueued) {
    const r = rows.find((x) => x.id === q.id)!;
    // Queued rows still hold the template in title/body.
    const copy = await writeNudgeCopy({ ruleId: r.ruleId, payload: r.payload as NudgePayload, templateTitle: r.title, templateBody: r.body });
    await db
      .update(nudges)
      .set({ status: "sent", sentAt: now, title: copy.title, body: copy.body, bodySource: copy.source })
      .where(and(eq(nudges.userId, userId), eq(nudges.id, q.id)));
    sent.push({ id: q.id, title: copy.title, body: copy.body });
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
    await pushNudges(userId, sent);
    await logActivity(userId, "nudge_sent", sent.length === 1 ? "Sent you 1 nudge" : `Sent you ${sent.length} nudges`);
  }

  return { candidates: candidates.length, sent: sent.map((n) => n.id), queued: plan.queueFresh.length, expired: plan.expire.length, quietHours: plan.quietHours };
}

/** The Expo Go local-notification fallback: what the next 7 daily runs will send. */
export async function upcomingNudges(userId: string, now: Date): Promise<UpcomingNudge[]> {
  const [input, { rows, history }] = await Promise.all([loadStateInput(userId, now), loadHistory(userId, now)]);
  const queued = rows
    .filter((r) => r.status === "queued")
    .map((r) => ({ id: r.id, ruleId: r.ruleId, dedupeKey: r.dedupeKey, priority: r.priority, expiresAt: r.expiresAt?.toISOString() ?? null, scheduledFor: r.scheduledFor?.toISOString() ?? null, title: r.title, body: r.body }));
  return simulateUpcoming(input, history, queued);
}

/** Users with any card account: the daily cron's work list. */
export async function nudgeUserIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: cardAccounts.userId }).from(cardAccounts).where(eq(cardAccounts.isActive, true));
  return rows.map((r) => r.userId);
}

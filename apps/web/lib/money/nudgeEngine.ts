import { and, eq, gte, inArray, or } from "drizzle-orm";
import { cardAccounts, db, nudges } from "@perq/db";
import {
  buildFinancialState,
  evaluateRules,
  IN_APP_ONLY_RULES,
  planBuyWindowCandidates,
  planNudges,
  simulateUpcoming,
  type NudgeCandidate,
  type NudgeHistoryEntry,
  type UpcomingNudge,
} from "@perq/finance-engine";
import { logActivity } from "./activity";
import { writeNudgeCopy } from "./nudgeCopy";
import { pushNudges } from "./push";
import { loadStateInput } from "./state";
import { expireStalePlans, planReminders, reminderUserIds } from "@/lib/plans/reminders";

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
  await expireStalePlans(userId, now);
  const [input, { rows, history }, reminders] = await Promise.all([loadStateInput(userId, now), loadHistory(userId, now), planReminders(userId, now)]);
  const state = buildFinancialState(input);
  const due = rows.filter((r) => r.status === "queued" && (!r.scheduledFor || r.scheduledFor <= now));
  // Plan reminders (Step 3 §8) re-run on today's state and compete with the other rules.
  const candidates = [...evaluateRules(state, now, history), ...planBuyWindowCandidates(reminders, now)];
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

  const sent: { id: string; ruleId: string; title: string; body: string }[] = [];
  for (const c of plan.sendFresh) {
    const copy = await writeNudgeCopy(c);
    const [inserted] = await db
      .insert(nudges)
      .values(row(c, { status: "sent", sentAt: now, title: copy.title, body: copy.body, bodySource: copy.source }))
      .onConflictDoNothing()
      .returning({ id: nudges.id });
    if (inserted) sent.push({ id: inserted.id, ruleId: c.ruleId, title: copy.title, body: copy.body });
  }
  for (const q of plan.sendQueued) {
    // Today's candidate, so the payload, copy and "why" reflect today's state.
    const c = q.current;
    const copy = await writeNudgeCopy(c);
    await db
      .update(nudges)
      .set({ status: "sent", sentAt: now, title: copy.title, body: copy.body, bodySource: copy.source, payload: c.payload, priority: c.priority, why: c.why, expiresAt: new Date(c.expiresAt) })
      .where(and(eq(nudges.userId, userId), eq(nudges.id, q.id)));
    sent.push({ id: q.id, ruleId: c.ruleId, title: copy.title, body: copy.body });
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
    // In-app-only nudges (Step 4's swiggy_pattern) wait in the inbox; they're never pushed.
    const toPush = sent.filter((n) => !IN_APP_ONLY_RULES.has(n.ruleId));
    if (toPush.length) await pushNudges(userId, toPush);
    await logActivity(userId, "nudge_sent", sent.length === 1 ? "Sent you 1 nudge" : `Sent you ${sent.length} nudges`);
  }

  return { candidates: candidates.length, sent: sent.map((n) => n.id), queued: plan.queueFresh.length, expired: plan.expire.length, quietHours: plan.quietHours };
}

/** The Expo Go local-notification fallback: what the next 7 daily runs will send. */
export async function upcomingNudges(userId: string, now: Date): Promise<UpcomingNudge[]> {
  const [input, { rows, history }, reminders] = await Promise.all([loadStateInput(userId, now), loadHistory(userId, now), planReminders(userId, now, 7)]);
  const queued = rows
    .filter((r) => r.status === "queued")
    .map((r) => ({ id: r.id, ruleId: r.ruleId, dedupeKey: r.dedupeKey, priority: r.priority, expiresAt: r.expiresAt?.toISOString() ?? null, scheduledFor: r.scheduledFor?.toISOString() ?? null, title: r.title, body: r.body }));
  return simulateUpcoming(input, history, queued, (at) => planBuyWindowCandidates(reminders, at));
}

/** Users with any card account, or a plan reminder due: the daily cron's work list. */
export async function nudgeUserIds(now: Date = new Date()): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: cardAccounts.userId }).from(cardAccounts).where(eq(cardAccounts.isActive, true));
  return [...new Set([...rows.map((r) => r.userId), ...(await reminderUserIds(now))])];
}

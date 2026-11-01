import type { FinancialState } from "../state";
import { istDate, IST_OFFSET_MIN } from "../state";
import { NUDGE_CONFIG, type NudgeConfig } from "./config";
import { budgetPace } from "./budgetPace";
import { dueSoon } from "./dueSoon";
import { dueToday } from "./dueToday";
import { feesCharged } from "./feesCharged";
import { feeWaiverPace } from "./feeWaiverPace";
import { goalProgress } from "./goalProgress";
import { highUtilisation } from "./highUtilisation";
import { minDueTrap } from "./minDueTrap";
import { missedRewards } from "./missedRewards";
import { pointsValue } from "./pointsValue";
import { PLAN_BUY_WINDOW_DESCRIPTION } from "./planBuyWindow";
import { statementUpload } from "./statementUpload";
import type { NudgeCandidate, NudgeHistoryEntry, NudgeRule } from "./types";

export const NUDGE_RULES: NudgeRule[] = [
  dueToday,
  dueSoon,
  minDueTrap,
  feesCharged,
  highUtilisation,
  statementUpload,
  feeWaiverPace,
  missedRewards,
  pointsValue,
  budgetPace,
  goalProgress,
];

export const RULE_DESCRIPTIONS: Record<string, string> = {
  ...Object.fromEntries(NUDGE_RULES.map((r) => [r.id, r.description])),
  plan_buy_window: PLAN_BUY_WINDOW_DESCRIPTION,
};

/** Every rule's candidates for this state (step 2 of §7.1). */
export function evaluateRules(state: FinancialState, now: Date, history: NudgeHistoryEntry[], config: NudgeConfig = NUDGE_CONFIG): NudgeCandidate[] {
  return NUDGE_RULES.flatMap((r) => r.evaluate(state, { now, history, config }));
}

/** IST hour of an instant. */
export function istHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).getUTCHours();
}

export function isQuietHours(now: Date, config: NudgeConfig = NUDGE_CONFIG): boolean {
  const h = istHour(now);
  return h >= config.quietStartHourIst || h < config.quietEndHourIst;
}

/** Next 09:00 IST at or after `now`. */
export function nextSendTime(now: Date, config: NudgeConfig = NUDGE_CONFIG): Date {
  const today = istDate(now);
  const at = (iso: string) => new Date(Date.parse(`${iso}T${String(config.sendAfterQuietHourIst).padStart(2, "0")}:00:00+05:30`));
  const t = at(today);
  return t.getTime() >= now.getTime() ? t : at(new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
}

/** Rules dismissed ≥ 3 times in 30 days without being acted on (§7.1 step 4). */
export function suppressedRules(history: NudgeHistoryEntry[], now: Date, config: NudgeConfig = NUDGE_CONFIG): Set<string> {
  const since = now.getTime() - config.suppression.windowDays * 86_400_000;
  const counts = new Map<string, { dismissed: number; acted: number }>();
  for (const h of history) {
    const c = counts.get(h.ruleId) ?? { dismissed: 0, acted: 0 };
    if (h.dismissedAt && Date.parse(h.dismissedAt) >= since && !h.actedAt) c.dismissed++;
    if (h.actedAt && Date.parse(h.actedAt) >= since) c.acted++;
    counts.set(h.ruleId, c);
  }
  return new Set([...counts.entries()].filter(([, c]) => c.dismissed >= config.suppression.dismissals && c.acted === 0).map(([r]) => r));
}

export interface QueuedNudge {
  id: string;
  ruleId: string;
  dedupeKey: string;
  priority: number;
  expiresAt: string | null;
}

export interface NudgePlan {
  /** New candidates to send now. */
  sendFresh: (NudgeCandidate & { priority: number })[];
  /** Previously queued nudges to send now, with today's candidate (fresh numbers and copy). */
  sendQueued: (QueuedNudge & { current: NudgeCandidate })[];
  /** New candidates to store as queued (cap reached or quiet hours), with when to retry. */
  queueFresh: (NudgeCandidate & { priority: number; scheduledFor: string })[];
  /** Queued nudges that expired. */
  expire: string[];
  quietHours: boolean;
  capRemaining: number;
}

/**
 * Decide what to send (§7.1 steps 3–5): drop duplicates (any status) and
 * expired candidates, lower learned-suppressed rules by 30, sort by priority,
 * respect the daily cap (counted on sent_at in IST) and quiet hours.
 */
export function planNudges(input: {
  candidates: NudgeCandidate[];
  queued: QueuedNudge[];
  history: NudgeHistoryEntry[];
  now: Date;
  config?: NudgeConfig;
}): NudgePlan {
  const config = input.config ?? NUDGE_CONFIG;
  const now = input.now;
  const seen = new Set(input.history.map((h) => h.dedupeKey));
  const suppressed = suppressedRules(input.history, now, config);
  const adjust = (ruleId: string, p: number) => (suppressed.has(ruleId) ? p - config.suppression.penalty : p);
  const live = (exp: string | null) => !exp || Date.parse(exp) > now.getTime();

  const fresh = input.candidates
    .filter((c) => !seen.has(c.dedupeKey) && live(c.expiresAt))
    .filter((c, i, all) => all.findIndex((x) => x.dedupeKey === c.dedupeKey) === i)
    .map((c) => ({ ...c, priority: adjust(c.ruleId, c.priority) }));
  // A queued nudge is only still true if today's evaluation produces it again;
  // it goes out with today's payload, so its numbers are never stale.
  const current = new Map(input.candidates.map((c) => [c.dedupeKey, c]));
  const stillTrue = (q: QueuedNudge) => live(q.expiresAt) && current.has(q.dedupeKey);
  const expire = input.queued.filter((q) => !stillTrue(q)).map((q) => q.id);
  const queued = input.queued
    .filter(stillTrue)
    .map((q) => ({ ...q, current: current.get(q.dedupeKey)!, priority: adjust(q.ruleId, current.get(q.dedupeKey)!.priority) }));

  const today = istDate(now);
  const sentToday = input.history.filter((h) => h.sentAt && istDate(new Date(h.sentAt)) === today).length;
  const quietHours = isQuietHours(now, config);
  const capRemaining = quietHours ? 0 : Math.max(0, config.dailyCap - sentToday);

  type Pool = { kind: "fresh"; item: (typeof fresh)[number] } | { kind: "queued"; item: (typeof queued)[number] };
  const pool: Pool[] = [
    ...fresh.map((item) => ({ kind: "fresh" as const, item })),
    ...queued.map((item) => ({ kind: "queued" as const, item })),
  ].sort((a, b) => b.item.priority - a.item.priority || a.item.dedupeKey.localeCompare(b.item.dedupeKey));

  const chosen = pool.slice(0, capRemaining);
  const later = nextSendTime(quietHours ? now : new Date(now.getTime() + 60_000), config);
  // When the cap is reached (not quiet hours), retry tomorrow at 09:00.
  const retryAt = quietHours ? later : nextSendTime(new Date(Date.parse(`${today}T23:59:00+05:30`)), config);

  return {
    sendFresh: chosen.filter((p) => p.kind === "fresh").map((p) => p.item as (typeof fresh)[number]),
    sendQueued: chosen.filter((p) => p.kind === "queued").map((p) => p.item as QueuedNudge & { current: NudgeCandidate }),
    queueFresh: pool
      .slice(capRemaining)
      .filter((p) => p.kind === "fresh")
      .map((p) => ({ ...(p.item as (typeof fresh)[number]), scheduledFor: retryAt.toISOString() })),
    expire,
    quietHours,
    capRemaining,
  };
}

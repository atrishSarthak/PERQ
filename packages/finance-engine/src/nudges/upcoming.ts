import { buildFinancialState, istDate, type StateInput } from "../state";
import { NUDGE_CONFIG, type NudgeConfig } from "./config";
import { evaluateRules, nextSendTime, planNudges, type QueuedNudge } from "./engine";
import type { NudgeHistoryEntry } from "./types";

// The Expo Go fallback (handoff §7.3): remote push isn't available, so the
// app schedules local notifications. This runs the same rules and planner
// forward one day at a time at the 09:00 IST send time, so the device gets
// exactly what the daily job will put in the inbox, cap and quiet hours included.

export interface UpcomingNudge {
  ruleId: string;
  dedupeKey: string;
  at: string; // ISO instant, always 09:00 IST
  title: string;
  body: string;
}

/** A nudge already stored as queued, with the copy it will go out with. */
export interface StoredQueuedNudge extends QueuedNudge {
  scheduledFor: string | null;
  title: string;
  body: string;
}

export function simulateUpcoming(
  input: StateInput,
  history: NudgeHistoryEntry[],
  queued: StoredQueuedNudge[] = [],
  days = 7,
  config: NudgeConfig = NUDGE_CONFIG
): UpcomingNudge[] {
  const out: UpcomingNudge[] = [];
  const seen = [...history];
  let waiting = [...queued];
  let at = nextSendTime(new Date(input.now.getTime() + 60_000), config);
  for (let d = 0; d < days; d++) {
    const state = buildFinancialState({ ...input, now: at });
    const due = waiting.filter((q) => !q.scheduledFor || Date.parse(q.scheduledFor) <= at.getTime());
    const plan = planNudges({ candidates: evaluateRules(state, at, seen, config), queued: due, history: seen, now: at, config });
    for (const q of plan.sendQueued) {
      const stored = waiting.find((w) => w.id === q.id)!;
      out.push({ ruleId: q.ruleId, dedupeKey: q.dedupeKey, at: at.toISOString(), title: stored.title, body: stored.body });
      seen.push({ ruleId: q.ruleId, dedupeKey: q.dedupeKey, status: "sent", sentAt: at.toISOString(), dismissedAt: null, actedAt: null, createdAt: at.toISOString() });
    }
    const gone = new Set([...plan.sendQueued.map((q) => q.id), ...plan.expire]);
    waiting = waiting.filter((w) => !gone.has(w.id));
    // Fresh candidates the cap holds back become queued, as in the real run.
    for (const c of plan.queueFresh) {
      waiting.push({ id: `sim:${c.dedupeKey}`, ruleId: c.ruleId, dedupeKey: c.dedupeKey, priority: c.priority, expiresAt: c.expiresAt, scheduledFor: c.scheduledFor, title: c.templateTitle, body: c.templateBody });
      seen.push({ ruleId: c.ruleId, dedupeKey: c.dedupeKey, status: "queued", sentAt: null, dismissedAt: null, actedAt: null, createdAt: at.toISOString() });
    }
    for (const c of plan.sendFresh) {
      out.push({ ruleId: c.ruleId, dedupeKey: c.dedupeKey, at: at.toISOString(), title: c.templateTitle, body: c.templateBody });
      seen.push({ ruleId: c.ruleId, dedupeKey: c.dedupeKey, status: "sent", sentAt: at.toISOString(), dismissedAt: null, actedAt: null, createdAt: at.toISOString() });
    }
    at = nextSendTime(new Date(Date.parse(`${istDate(at)}T23:59:00+05:30`)), config);
  }
  return out;
}

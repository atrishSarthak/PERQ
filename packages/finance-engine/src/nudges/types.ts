import type { FinancialState } from "../state";
import type { NudgeConfig } from "./config";

// A nudge rule decides WHETHER and WHAT (handoff §7.1). The payload holds
// every number the copy may use; Gemini only rewrites the wording and is
// checked against the payload.

export type NudgePayload = Record<string, string | number | boolean | null>;

export interface NudgeCandidate {
  ruleId: string;
  dedupeKey: string;
  priority: number; // 0–100
  cardAccountId?: string;
  payload: NudgePayload;
  expiresAt: string; // ISO instant
  templateTitle: string;
  templateBody: string;
  /** Plain-English "why am I seeing this?" for the rule. */
  why: string;
}

export interface NudgeHistoryEntry {
  ruleId: string;
  dedupeKey: string;
  status: string;
  sentAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
  createdAt: string;
}

export interface RuleContext {
  now: Date;
  history: NudgeHistoryEntry[];
  config: NudgeConfig;
}

export interface NudgeRule {
  id: string;
  /** Shown in "Why am I seeing this?". */
  description: string;
  evaluate(state: FinancialState, ctx: RuleContext): NudgeCandidate[];
}

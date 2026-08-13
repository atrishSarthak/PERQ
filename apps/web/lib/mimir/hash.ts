import { createHash } from "node:crypto";
import type { QuizAnswers } from "@perq/scoring-engine";
import type { Card } from "@perq/db";

/**
 * D6: sha256 of the normalized answers jsonb. Deterministic key sorting so
 * the same answers always hash identically regardless of property order.
 */
export function computeProfileHash(answers: QuizAnswers): string {
  const normalized = JSON.stringify(answers, Object.keys(answers).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * D10: max(source_updated_at) across active cards. A card-database refresh
 * that changes any card's terms bumps this, invalidating every cached
 * explanation at once — coarse-grained by design (seed runs are infrequent,
 * not per-request).
 */
export function computeCardsVersion(cards: Pick<Card, "sourceUpdatedAt">[]): string {
  if (cards.length === 0) return "0";
  const latest = cards.reduce(
    (max, c) => (c.sourceUpdatedAt > max ? c.sourceUpdatedAt : max),
    cards[0]!.sourceUpdatedAt
  );
  return latest.getTime().toString();
}

/**
 * D15: the search-cache partition key — deliberately coarser than
 * computeProfileHash. Built only from the signals that actually change what
 * MIMIR should search FOR (income bracket, fee tolerance, and the user's
 * explicit top-2 priority categories), not exact spend amounts. This is what
 * lets many users with a similar "shape" of profile share one cached web
 * search instead of re-searching per user, keeping Gemini calls bounded
 * against the free-tier daily quota.
 */
export function computeSearchBucketKey(answers: QuizAnswers): string {
  const shape = {
    annualIncome: answers.annualIncome,
    feeTolerant: answers.feeTolerant,
    priorityCategories: [...answers.priorityCategories].sort(),
  };
  const normalized = JSON.stringify(shape, Object.keys(shape).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

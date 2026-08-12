import type { Card, SpendCategory } from "./types";

/**
 * Low-level scoring primitive (D4): given a set of cards (e.g. a user's
 * arsenal) and a single spend category, returns whichever card has the
 * highest reward rate for that category. No quiz profile needed — this is
 * the exact shape Feature 2 (Chrome extension) reuses directly against a
 * user's held cards to answer "which card unlocks the best offer right now,"
 * without depending on Feature 1's full quiz-profile ranking.
 *
 * Pure, no I/O. Returns null for an empty card list.
 */
export function getBestCardForCategory(
  cards: Card[],
  category: SpendCategory
): Card | null {
  if (cards.length === 0) return null;

  return cards.reduce((best, current) => {
    const bestRate = best.rewardRates[category] ?? 0;
    const currentRate = current.rewardRates[category] ?? 0;
    return currentRate > bestRate ? current : best;
  });
}

import type { FrequencyBucket, SpendBucket } from "./types";

/**
 * Converts a bucketed monthly spend answer (Q6-Q10: food delivery,
 * e-commerce, groceries, dining-out, fuel) into a numeric ₹/month estimate.
 * Single source of truth (2B) — called by both initial quiz scoring and
 * every profile-edit re-score, never re-derived at the call site.
 */
export function estimateSpendFromBucket(bucket: SpendBucket): number {
  switch (bucket) {
    case "<1k":
      return 500;
    case "1-3k":
      return 2000;
    case "3-6k":
      return 4500;
    case "6k+":
      return 7500;
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Unknown spend bucket: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Converts a frequency answer (Q3/Q4: flights, hotel stays per year) into a
 * ₹/month spend estimate, given an assumed average ₹ value per occurrence.
 * Co-located with estimateSpendFromBucket for the same reason (2B) — one
 * implementation for every frequency-shaped question.
 */
export function estimateSpendFromFrequency(
  frequency: FrequencyBucket,
  avgValuePerOccurrence: number
): number {
  const occurrencesPerYear = (() => {
    switch (frequency) {
      case "never":
        return 0;
      case "1-2":
        return 1.5;
      case "3-5":
        return 4;
      case "6+":
        return 8;
      default: {
        const _exhaustive: never = frequency;
        throw new Error(`Unknown frequency bucket: ${String(_exhaustive)}`);
      }
    }
  })();

  return (occurrencesPerYear * avgValuePerOccurrence) / 12;
}

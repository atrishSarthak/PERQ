import type { Card as DbCard } from "../src/types";
import type { CardSource } from "./cardSourceSchema";

/**
 * Postgres jsonb does not preserve object key insertion order — a value
 * round-tripped through the DB can come back with keys in a different
 * order than it was written with, even though the actual key/value pairs
 * are identical. Plain JSON.stringify is order-sensitive, so comparing
 * jsonb columns with it produces false "changed" positives on every
 * re-seed of unchanged data. Recursively sorting object keys before
 * stringifying makes the comparison order-independent (array element
 * order is preserved and still significant, e.g. milestoneBenefits).
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * D10: source_updated_at must only bump for cards whose fields actually
 * changed — re-running the same source file with no real changes must NOT
 * invalidate every user's explanation cache for nothing. Extracted from
 * seed-cards.ts (which runs main() at module scope) so this diff logic is
 * importable and testable without triggering a real seed run.
 */
export function fieldsEqual(existing: DbCard, incoming: CardSource): boolean {
  return (
    existing.name === incoming.name &&
    existing.issuer === incoming.issuer &&
    existing.network === incoming.network &&
    (existing.tier ?? null) === (incoming.tier ?? null) &&
    Number(existing.joiningFee) === incoming.joiningFee &&
    Number(existing.annualFee) === incoming.annualFee &&
    (existing.feeWaiverCondition ?? null) === (incoming.feeWaiverCondition ?? null) &&
    stableStringify(existing.rewardRates) === stableStringify(incoming.rewardRates) &&
    stableStringify(existing.milestoneBenefits ?? []) ===
      stableStringify(incoming.milestoneBenefits ?? []) &&
    (existing.welcomeBonus ?? null) === (incoming.welcomeBonus ?? null) &&
    stableStringify(existing.loungeAccess ?? null) === stableStringify(incoming.loungeAccess ?? null) &&
    (existing.forexMarkupPct === null ? null : Number(existing.forexMarkupPct)) ===
      (incoming.forexMarkupPct ?? null) &&
    (existing.redemptionValue === null ? null : Number(existing.redemptionValue)) ===
      (incoming.redemptionValue ?? null) &&
    (existing.minIncomeEligibility === null ? null : Number(existing.minIncomeEligibility)) ===
      (incoming.minIncomeEligibility ?? null) &&
    (existing.coBrandPartner ?? null) === (incoming.coBrandPartner ?? null) &&
    existing.status === "active"
  );
}

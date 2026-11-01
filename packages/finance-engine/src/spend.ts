import type { StateStatement, StateTransaction } from "./state";

// Average monthly spend per category from statements (handoff §9, §10.7).
// One statement ≈ one month of that card's spend, so each card contributes
// the mean of its latest `maxStatements` reconciled cycles, and cards add up.

const NON_SPEND = new Set(["transfers", "fees_interest", "emi", "cash"]);

export interface AverageSpend {
  perMonth: Record<string, number>; // ₹ per month by transaction category, rounded
  total: number;
  statementCount: number;
  dataThrough: string | null;
}

export function averageMonthlySpend(
  statements: Pick<StateStatement, "id" | "cardAccountId" | "statementDate" | "reconciled">[],
  transactions: (Pick<StateTransaction, "statementId" | "amount" | "kind" | "category"> & { direction: string })[],
  maxStatements = 3
): AverageSpend {
  const byCard = new Map<string, typeof statements>();
  for (const s of statements.filter((x) => x.reconciled)) byCard.set(s.cardAccountId, [...(byCard.get(s.cardAccountId) ?? []), s]);

  const sums: Record<string, number> = {};
  let count = 0;
  let dataThrough: string | null = null;
  for (const list of byCard.values()) {
    const used = [...list].sort((a, b) => b.statementDate.localeCompare(a.statementDate)).slice(0, maxStatements);
    const ids = new Set(used.map((s) => s.id));
    count += used.length;
    if (used[0] && (!dataThrough || used[0].statementDate > dataThrough)) dataThrough = used[0].statementDate;
    for (const t of transactions) {
      if (!ids.has(t.statementId) || NON_SPEND.has(t.category)) continue;
      // Purchases add, refunds and cashback on purchases subtract; payments are ignored.
      const sign = t.direction === "debit" && t.kind === "purchase" ? 1 : t.direction === "credit" && (t.kind === "refund" || t.kind === "cashback") ? -1 : 0;
      sums[t.category] = (sums[t.category] ?? 0) + (sign * t.amount) / used.length;
    }
  }
  const perMonth = Object.fromEntries(
    Object.entries(sums)
      .map(([k, v]) => [k, Math.max(0, Math.round(v))] as const)
      .filter(([, v]) => v > 0)
  );
  return { perMonth, total: Object.values(perMonth).reduce((a, b) => a + b, 0), statementCount: count, dataThrough };
}

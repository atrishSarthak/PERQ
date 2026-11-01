// Statement reconciliation (handoff §5.4, Locked). A statement is only
// treated as correct if its summary adds up AND its transaction lines add
// up to the summary. Pure: works on the extracted figures (₹, may carry paise).

export interface ReconcileInput {
  totalDue: number | null;
  previousBalance: number | null;
  paymentsCredits: number | null;
  purchasesDebits: number | null;
  feesCharges: number | null;
  financeCharges: number | null;
  transactions: { amount: number; direction: "debit" | "credit" }[];
}

export interface ReconcileResult {
  reconciled: boolean;
  /** Summary identity: previous − credits + debits + fees + finance = total due. */
  summary: { ok: boolean; expectedTotal: number | null; diff: number | null };
  /** Transaction lines vs the summary block. */
  lines: { ok: boolean; debitSum: number; creditSum: number; debitDiff: number | null; creditDiff: number | null };
  tolerance: number;
  /** Plain-language problems, used in the retry prompt and the review screen. */
  issues: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ±max(₹5, 0.1% of total due). */
export function reconcileTolerance(totalDue: number | null): number {
  return Math.max(5, Math.abs(totalDue ?? 0) * 0.001);
}

export function reconcile(s: ReconcileInput): ReconcileResult {
  const tolerance = reconcileTolerance(s.totalDue);
  const issues: string[] = [];
  const fees = s.feesCharges ?? 0; // often printed only when non-zero
  const finance = s.financeCharges ?? 0;

  const debitSum = r2(s.transactions.filter((t) => t.direction === "debit").reduce((a, t) => a + t.amount, 0));
  const creditSum = r2(s.transactions.filter((t) => t.direction === "credit").reduce((a, t) => a + t.amount, 0));

  const required = { totalDue: s.totalDue, previousBalance: s.previousBalance, paymentsCredits: s.paymentsCredits, purchasesDebits: s.purchasesDebits };
  const missing = Object.entries(required).filter(([, v]) => v === null || v === undefined).map(([k]) => k);
  if (missing.length) {
    issues.push(`Missing summary figures: ${missing.join(", ")}.`);
    return {
      reconciled: false,
      summary: { ok: false, expectedTotal: null, diff: null },
      lines: { ok: false, debitSum, creditSum, debitDiff: null, creditDiff: null },
      tolerance,
      issues,
    };
  }

  const expectedTotal = r2(s.previousBalance! - s.paymentsCredits! + s.purchasesDebits! + fees + finance);
  const diff = r2(expectedTotal - s.totalDue!);
  const summaryOk = Math.abs(diff) <= tolerance;
  if (!summaryOk) {
    issues.push(
      `The summary doesn't add up: previous balance ${s.previousBalance} − payments/credits ${s.paymentsCredits} + purchases/debits ${s.purchasesDebits} + fees ${fees} + finance charges ${finance} = ${expectedTotal}, but total due says ${s.totalDue}.`
    );
  }

  const debitDiff = r2(debitSum - (s.purchasesDebits! + fees + finance));
  const creditDiff = r2(creditSum - s.paymentsCredits!);
  const linesOk = Math.abs(debitDiff) <= tolerance && Math.abs(creditDiff) <= tolerance;
  if (Math.abs(debitDiff) > tolerance) {
    issues.push(`Debit lines sum to ${debitSum}, but purchases + fees + finance charges in the summary are ${r2(s.purchasesDebits! + fees + finance)}.`);
  }
  if (Math.abs(creditDiff) > tolerance) {
    issues.push(`Credit lines sum to ${creditSum}, but payments/credits in the summary are ${s.paymentsCredits}.`);
  }

  return {
    reconciled: summaryOk && linesOk,
    summary: { ok: summaryOk, expectedTotal, diff },
    lines: { ok: linesOk, debitSum, creditSum, debitDiff, creditDiff },
    tolerance,
    issues,
  };
}

// Runs after any write to a user's money data (statement confirmed, balance
// updated, budget changed). The nudge engine hooks in at checkpoint 8.
export type MoneyWriteReason = "statement_confirmed" | "statement_deleted" | "balance_updated" | "budget_changed" | "goal_changed" | "marked_paid";

export async function afterMoneyWrite(_userId: string, _reason: MoneyWriteReason): Promise<void> {}

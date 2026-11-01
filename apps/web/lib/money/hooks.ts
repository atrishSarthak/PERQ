import { runNudgeEngine } from "./nudgeEngine";
import { nowFor } from "./clock";

// Runs after any write to a user's money data (statement confirmed, balance
// updated, budget changed): re-evaluate nudges so a new statement's due date
// or fee shows up straight away instead of at the next cron.
export type MoneyWriteReason = "statement_confirmed" | "statement_deleted" | "balance_updated" | "budget_changed" | "goal_changed" | "marked_paid";

export async function afterMoneyWrite(userId: string, _reason: MoneyWriteReason): Promise<void> {
  try {
    await runNudgeEngine(userId, await nowFor(userId));
  } catch (err) {
    // A nudge failure must never fail the user's save.
    console.error("nudge engine failed", { userId, error: err instanceof Error ? err.message : "unknown" });
  }
}

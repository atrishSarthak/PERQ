import { after } from "next/server";
import { runNudgeEngine } from "./nudgeEngine";
import { nowFor } from "./clock";
import { offerPlanMatches } from "@/lib/plans/match";

// Runs after any write to a user's money data (statement confirmed, balance
// updated, budget changed): re-evaluate nudges so a new statement's due date
// or fee shows up straight away instead of at the next cron. Scheduled with
// after() so the user's save returns without waiting on Gemini copy.
export type MoneyWriteReason = "statement_confirmed" | "statement_deleted" | "balance_updated" | "budget_changed" | "goal_changed" | "marked_paid";

export async function afterMoneyWrite(userId: string, reason: MoneyWriteReason): Promise<void> {
  after(async () => {
    try {
      const now = await nowFor(userId);
      // A new statement may hold a purchase the user planned (Step 3 §8).
      if (reason === "statement_confirmed") await offerPlanMatches(userId, now);
      await runNudgeEngine(userId, now);
    } catch (err) {
      // A nudge failure must never fail the user's save.
      console.error("nudge engine failed", { userId, error: err instanceof Error ? err.message : "unknown" });
    }
  });
}

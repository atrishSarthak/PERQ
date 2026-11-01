import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { agentRuns, cardAccounts, db, purchasePlans, transactions, type PurchasePlanRow } from "@perq/db";
import { planPurchase } from "@perq/finance-engine";
import type { PlanDetailResponse, PlanInput, PlanResult, PlanSource, PlanSummary } from "@perq/shared";
import { logAgentRun } from "@/lib/ember/agentRunLog";
import { geminiCaller } from "@/lib/ember/recommender/run";
import { logActivity } from "@/lib/money/activity";
import { loadPlanContext } from "./context";
import { explainPlan, type PlanExplanation } from "./explain";

// Purchase plans (Step 3 §4, §7.2). The engine result is computed first, so
// the answer never depends on what the model chooses to do; Gemini only
// words it afterwards.

/** Plans run per user per day, and screenshot/message extractions (§9: protects the Gemini quota). */
export const PLAN_DAILY_LIMIT = 20;

export async function plansRunToday(userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const rows = await db.select({ id: purchasePlans.id }).from(purchasePlans).where(and(eq(purchasePlans.userId, userId), gte(purchasePlans.createdAt, since)));
  return rows.length;
}
export async function extractionsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), inArray(agentRuns.task, ["plan_extract_image", "plan_extract_text"]), gte(agentRuns.createdAt, since)));
  return rows.length;
}

export interface ComputedPlan {
  result: PlanResult;
  snapshot: Record<string, unknown>;
  monthName: string;
}

export async function computePlan(userId: string, input: PlanInput, now: Date): Promise<ComputedPlan> {
  const { ctx, snapshot, monthName } = await loadPlanContext(userId, now);
  return { result: planPurchase(input, ctx), snapshot, monthName };
}

export async function explain(userId: string, input: PlanInput, result: PlanResult, task = "plan"): Promise<PlanExplanation> {
  return explainPlan({ userId, input, result, callModel: geminiCaller(), logRun: logAgentRun, task });
}

export async function savePlan(
  userId: string,
  input: PlanInput,
  source: PlanSource,
  computed: ComputedPlan,
  explanation: PlanExplanation
): Promise<PurchasePlanRow> {
  const [row] = await db
    .insert(purchasePlans)
    .values({
      userId,
      itemName: input.item.name,
      category: input.item.category,
      price: input.price,
      merchant: input.merchant ?? null,
      source,
      needByDate: input.needBy ?? null,
      offers: input.offers,
      emiOptions: input.emiOptions,
      inputsSnapshot: computed.snapshot,
      result: computed.result,
      verdict: computed.result.verdict,
      explanation: explanation.text,
      explanationSource: explanation.source,
      status: "planned",
      agentRunId: explanation.runId,
    })
    .returning();
  await logActivity(userId, "plan_created", `Planned a purchase: ${input.item.name} (${verdictWords(computed.result)})`, { table: "purchase_plans", id: row!.id });
  return row!;
}

export const verdictWords = (r: PlanResult) => r.headline;

export function planInputOf(row: PurchasePlanRow): PlanInput {
  return {
    item: { name: row.itemName, category: row.category as PlanInput["item"]["category"] },
    price: row.price,
    ...(row.merchant ? { merchant: row.merchant } : {}),
    ...(row.needByDate ? { needBy: row.needByDate } : {}),
    offers: (row.offers ?? []) as PlanInput["offers"],
    emiOptions: (row.emiOptions ?? []) as PlanInput["emiOptions"],
  };
}

export function toSummary(row: PurchasePlanRow): PlanSummary {
  const result = row.result as PlanResult | null;
  return {
    id: row.id,
    itemName: row.itemName,
    category: row.category,
    price: row.price,
    merchant: row.merchant,
    verdict: (row.verdict as PlanSummary["verdict"]) ?? null,
    status: row.status as PlanSummary["status"],
    remindAt: row.remindAt,
    needByDate: row.needByDate,
    recommendedLabel: result?.recommended.label ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPlanRow(userId: string, id: string): Promise<PurchasePlanRow | null> {
  const [row] = await db.select().from(purchasePlans).where(and(eq(purchasePlans.id, id), eq(purchasePlans.userId, userId))).limit(1);
  return row ?? null;
}

export async function listPlans(userId: string): Promise<PurchasePlanRow[]> {
  return db.select().from(purchasePlans).where(eq(purchasePlans.userId, userId)).orderBy(desc(purchasePlans.createdAt)).limit(100);
}

export async function planDetail(row: PurchasePlanRow): Promise<PlanDetailResponse> {
  let matched: PlanDetailResponse["matchedTransaction"] = null;
  if (row.matchedTransactionId) {
    const [t] = await db
      .select({ id: transactions.id, date: transactions.txnDate, merchant: transactions.merchantNormalized, amount: transactions.amount, cardLabel: cardAccounts.cardLabel })
      .from(transactions)
      .innerJoin(cardAccounts, eq(cardAccounts.id, transactions.cardAccountId))
      .where(and(eq(transactions.id, row.matchedTransactionId), eq(transactions.userId, row.userId)))
      .limit(1);
    matched = t ?? null;
  }
  return {
    plan: {
      ...toSummary(row),
      source: row.source as PlanSource,
      input: planInputOf(row),
      result: (row.result as PlanResult | null) ?? null,
      explanation: row.explanation,
      explanationSource: (row.explanationSource as "ai" | "template" | null) ?? null,
    },
    matchedTransaction: matched,
  };
}

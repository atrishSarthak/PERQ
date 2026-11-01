import { eq } from "drizzle-orm";
import { db, statements, transactions, users } from "@perq/db";
import { averageMonthlySpend, planContextFromState, type PlanCardTerms, type PlanContext } from "@perq/finance-engine";
import { INCOME_BUCKET_RUPEES, type CatalogCard } from "@perq/shared";
import { getFinancialState } from "@/lib/money/state";
import { loadCatalogue } from "@/lib/recommender/catalog";
import { getHeldCardIds, getProfile } from "@/lib/recommender/service";

// Everything the planner reads about a user (Step 3 §5.1): the Money Manager
// state, held cards with catalogue terms, and the quiz income band.

export function planCardTerms(c: CatalogCard): PlanCardTerms {
  return {
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    networks: c.networks,
    rewardRates: c.rewardRates,
    redemptionValue: c.redemptionValue,
    feeWaiverSpend: c.feeWaiverSpend,
    annualFee: c.annualFee,
    rewardCaps: c.rewardCaps,
    capGroups: c.capGroups,
    emiRewards: c.emiRewards,
  };
}

/**
 * Demo mode's take-home income (₹/month). Demo plans must open the same verdict on any account,
 * so a demo user's quiz band is not used; Reset demo brings it back.
 */
export const DEMO_MONTHLY_INCOME = 100000;

export interface LoadedPlanContext {
  ctx: PlanContext;
  /** The state figures a plan used, stored as purchase_plans.inputs_snapshot. */
  snapshot: Record<string, unknown>;
  monthName: string;
}

export async function loadPlanContext(userId: string, now: Date): Promise<LoadedPlanContext> {
  const [state, catalogue, held, profile, stmts, txns, [user]] = await Promise.all([
    getFinancialState(userId, now),
    loadCatalogue(),
    getHeldCardIds(userId),
    getProfile(userId),
    db.select().from(statements).where(eq(statements.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const termsById = new Map(catalogue.map((c) => [c.id, planCardTerms(c)]));
  const income = user?.isDemo ? DEMO_MONTHLY_INCOME : profile?.answers.monthlyIncome ? INCOME_BUCKET_RUPEES[profile.answers.monthlyIncome].mid : null;
  const avg = stmts.length ? averageMonthlySpend(stmts, txns).total : null;
  const ctx = planContextFromState(state, { termsById, heldCatalogueIds: held, monthlyIncome: income, averageMonthlySpend: avg });
  const monthName = new Date(`${state.month.key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  return {
    ctx,
    monthName,
    snapshot: {
      asOf: ctx.today,
      leftToSpend: ctx.leftToSpend,
      monthSpend: ctx.monthSpend,
      monthlyIncome: ctx.monthlyIncome,
      averageMonthlySpend: ctx.averageMonthlySpend,
      dataThrough: state.dataThrough,
      cards: ctx.cards.map((c) => ({
        cardAccountId: c.cardAccountId,
        label: c.label,
        catalogueCardId: c.terms?.id ?? null,
        statementDay: c.statementDay,
        dueDay: c.dueDay,
        creditLimit: c.creditLimit,
        balance: c.balance,
      })),
      goals: ctx.goals,
    },
  };
}

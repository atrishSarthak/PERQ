import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  activityEvents,
  purchasePlans,
  swiggyCarts,
  swiggyOrders,
  agentRuns,
  budgets,
  cardAccounts,
  consents,
  financialStateCache,
  merchantCategories,
  savingsGoals,
  nudges,
  pushTokens,
  statements,
  transactions,
  userMerchantOverrides,
  cards,
  chatMessages,
  goalRecommendations,
  goals,
  recommendations,
  userCardArsenal,
  userProfile,
  users,
} from "./schema";

export type User = InferSelectModel<typeof users>;
export type UserProfileRow = InferSelectModel<typeof userProfile>;
export type Card = InferSelectModel<typeof cards>;
export type NewCard = InferInsertModel<typeof cards>;
export type RecommendationRow = InferSelectModel<typeof recommendations>;
export type NewRecommendationRow = InferInsertModel<typeof recommendations>;
export type UserCardArsenalRow = InferSelectModel<typeof userCardArsenal>;
export type ChatMessageRow = InferSelectModel<typeof chatMessages>;
export type AgentRunRow = InferSelectModel<typeof agentRuns>;

export type GoalRow = InferSelectModel<typeof goals>;
export type NewGoalRow = InferInsertModel<typeof goals>;
export type GoalRecommendationRow = InferSelectModel<typeof goalRecommendations>;
export type NewGoalRecommendationRow = InferInsertModel<typeof goalRecommendations>;

// Step 2: Money Manager
export type CardAccountRow = InferSelectModel<typeof cardAccounts>;
export type NewCardAccountRow = InferInsertModel<typeof cardAccounts>;
export type StatementRow = InferSelectModel<typeof statements>;
export type NewStatementRow = InferInsertModel<typeof statements>;
export type TransactionRow = InferSelectModel<typeof transactions>;
export type NewTransactionRow = InferInsertModel<typeof transactions>;
export type MerchantCategoryRow = InferSelectModel<typeof merchantCategories>;
export type UserMerchantOverrideRow = InferSelectModel<typeof userMerchantOverrides>;
export type BudgetRow = InferSelectModel<typeof budgets>;
export type SavingsGoalRow = InferSelectModel<typeof savingsGoals>;
export type NudgeRow = InferSelectModel<typeof nudges>;
export type NewNudgeRow = InferInsertModel<typeof nudges>;
export type PushTokenRow = InferSelectModel<typeof pushTokens>;
export type ConsentRow = InferSelectModel<typeof consents>;
export type ActivityEventRow = InferSelectModel<typeof activityEvents>;
export type FinancialStateCacheRow = InferSelectModel<typeof financialStateCache>;

export type PurchasePlanRow = InferSelectModel<typeof purchasePlans>;
export type NewPurchasePlanRow = InferInsertModel<typeof purchasePlans>;
export type SwiggyOrderRow = InferSelectModel<typeof swiggyOrders>;
export type SwiggyCartRow = InferSelectModel<typeof swiggyCarts>;

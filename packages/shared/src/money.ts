import { z } from "zod";

// Step 2 Money Manager vocabularies (handoff §4, §5.5, §7.2). The DB stores
// these as text; these zod enums are the single list of allowed values.

/** Transaction categories (§5.5). The first 9 are the recommender's categories. */
export const TXN_CATEGORIES = [
  "food_delivery",
  "online_shopping",
  "groceries",
  "dining",
  "fuel",
  "bills",
  "travel",
  "upi",
  "entertainment",
  "health",
  "education",
  "rent",
  "emi",
  "fees_interest",
  "cash",
  "transfers",
  "other",
] as const;
export const txnCategorySchema = z.enum(TXN_CATEGORIES);
export type TxnCategory = z.infer<typeof txnCategorySchema>;

export const TXN_CATEGORY_LABELS: Record<TxnCategory, string> = {
  food_delivery: "Food delivery",
  online_shopping: "Online shopping",
  groceries: "Groceries",
  dining: "Dining out",
  fuel: "Fuel",
  bills: "Bills & subscriptions",
  travel: "Travel",
  upi: "UPI",
  entertainment: "Entertainment",
  health: "Health",
  education: "Education",
  rent: "Rent",
  emi: "EMI",
  fees_interest: "Fees & interest",
  cash: "Cash",
  transfers: "Transfers",
  other: "Other",
};

/**
 * How a transaction category maps onto the recommender's 9 reward
 * categories (AUDIT Step 2 #4). null = not reward-earning spend, so it's
 * left out of synced spend.
 */
export const TXN_TO_RECOMMENDER: Record<TxnCategory, string | null> = {
  food_delivery: "food_delivery",
  online_shopping: "online_shopping",
  groceries: "groceries",
  dining: "dining",
  fuel: "fuel",
  bills: "bills",
  travel: "travel",
  upi: "upi",
  entertainment: "other",
  health: "other",
  education: "other",
  other: "other",
  rent: null,
  emi: null,
  fees_interest: null,
  cash: null,
  transfers: null,
};

export const txnKindSchema = z.enum(["purchase", "payment", "refund", "fee", "interest", "emi", "cashback", "other"]);
export type TxnKind = z.infer<typeof txnKindSchema>;
export const txnDirectionSchema = z.enum(["debit", "credit"]);
export type TxnDirection = z.infer<typeof txnDirectionSchema>;
export const categorySourceSchema = z.enum(["rule", "cache", "ai", "user"]);
export type CategorySource = z.infer<typeof categorySourceSchema>;

export const NUDGE_RULE_IDS = [
  "due_soon",
  "due_today",
  "min_due_trap",
  "fees_charged",
  "high_utilisation",
  "statement_upload",
  "fee_waiver_pace",
  "missed_rewards",
  "points_value",
  "budget_pace",
  "goal_progress",
] as const;
export const nudgeRuleIdSchema = z.enum(NUDGE_RULE_IDS);
export type NudgeRuleId = z.infer<typeof nudgeRuleIdSchema>;

export const nudgeStatusSchema = z.enum(["queued", "sent", "opened", "acted", "dismissed", "expired", "suppressed"]);
export type NudgeStatus = z.infer<typeof nudgeStatusSchema>;

export const consentSourceSchema = z.enum(["statements", "notifications"]);
export type ConsentSource = z.infer<typeof consentSourceSchema>;

export const goalStatusSchema = z.enum(["active", "done", "archived"]);
export const spendSourceSchema = z.enum(["quiz", "statements"]);

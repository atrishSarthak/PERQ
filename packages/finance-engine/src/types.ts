// Domain types for PERQ's money math. Deliberately independent of the DB
// row shape: packages/db maps `cards` rows into FinanceCard at the boundary.

export const CATEGORIES = [
  "food_delivery",
  "online_shopping",
  "groceries",
  "dining",
  "fuel",
  "bills",
  "upi",
  "travel",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** ₹ per month, per category. */
export type MonthlySpend = Record<Category, number>;

export interface Milestone {
  annualSpend: number; // ₹ spent in a card-year to unlock it
  value: number; // ₹ value of the benefit (conservative)
}

export interface FinanceCard {
  id: string;
  joiningFee: number; // ₹, before GST
  annualFee: number; // ₹ renewal fee, before GST
  // Value back as a PERCENT of spend, per category, already converted from
  // points using the card's redemption value (e.g. 5 = 5%). 0 = no rewards.
  rewardRates: Record<Category, number>;
  // Monthly cap on the ₹ REWARD earned (not on spend), per category.
  // null/undefined = no cap. `total` caps the sum across all categories.
  rewardCaps: Partial<Record<Category | "total", number | null>>;
  feeWaiverSpend: number | null; // ₹ annual spend that waives the renewal fee
  // Spend that doesn't count toward the waiver (commonly fuel, UPI, bills).
  waiverExcludes?: Category[];
  welcomeBenefitValue: number; // ₹, year 1 only, conservative estimate
  milestones?: Milestone[];
}

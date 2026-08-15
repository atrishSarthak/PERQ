// packages/scoring-engine owns its own domain types, independent of Drizzle's
// generated types (worktree design note, Engineering Plan §11) — this package
// has zero I/O and zero dependency on packages/db. packages/db maps its rows
// to/from these shapes at the boundary.

export type SpendCategory =
  | "dining"
  | "travel"
  | "hotels"
  | "fuel"
  | "groceries"
  | "ecommerce"
  | "utilities"
  | "general";

export const SPEND_CATEGORIES: SpendCategory[] = [
  "dining",
  "travel",
  "hotels",
  "fuel",
  "groceries",
  "ecommerce",
  "utilities",
  "general",
];

// The 4-tier bucket shape used by every bucketed quiz question (PRD §8,
// Q6-Q10: food delivery / e-commerce / groceries / dining-out / fuel).
export type SpendBucket = "<1k" | "1-3k" | "3-6k" | "6k+";

// The 4-tier frequency shape used by Q3/Q4 (flight/hotel frequency).
export type FrequencyBucket = "never" | "1-2" | "3-5" | "6+";

export interface MilestoneBenefit {
  spendThreshold: number; // ₹ annual spend required
  bonusValue: number; // ₹ value of the milestone reward
}

export interface Card {
  id: string;
  annualFee: number;
  // Effective value returned per ₹ spent in each category, as a decimal
  // fraction (e.g. 0.02 = 2%). Card-database compilation (real content work,
  // out of engineering scope per Engineering Plan §8) is responsible for
  // normalizing point-based reward systems into this ₹-value-per-₹-spent
  // shape using the card's own redemption value before this data reaches
  // scoreCards.
  rewardRates: Record<SpendCategory, number>;
  milestoneBenefits: MilestoneBenefit[];
  minIncomeEligibility: number | null;
}

// Derived, normalized profile — the shape scoreCards actually consumes.
// Raw 13-question quiz answers are converted into this via
// estimateSpendFromBucket before scoring.
export interface UserProfile {
  categorySpend: Record<SpendCategory, number>; // ₹/month, per category
  annualIncome: number | null;
  feeTolerant: boolean; // Q12: open to an annual fee if rewards outweigh it
  priorityCategories: SpendCategory[]; // Q13: up to 2 picks
}

export interface CategoryScoreBreakdown {
  category: SpendCategory;
  monthlySpend: number;
  rewardRate: number;
  annualValue: number; // rewardRate * (monthlySpend * 12)
}

export interface ScoredCard {
  card: Card;
  score: number;
  breakdown: CategoryScoreBreakdown[];
  milestoneValue: number;
  priorityBoost: number;
  eligible: boolean; // false if annualIncome is below minIncomeEligibility
}

export type IncomeBracket =
  | "under-3l"
  | "3-6l"
  | "6-10l"
  | "10l+"
  | "prefer-not-to-say";

// Q5's finalized copy is a single bucketed pick, not a free-form ₹ amount —
// gymMembership never feeds the deterministic score (see
// buildProfileFromAnswers), so a bucket is all downstream code needs.
export type GymMembershipBucket = "none" | "under-1500" | "1500-plus";

// Q11's finalized copy adds a third "Some of them" state between yes/no.
export type RecurringBillsAnswer = "yes" | "no" | "some";

// Raw shape of the 13 quiz answers (PRD §8), keyed by question_key — this is
// what's stored in user_profile.answers jsonb and what a profile edit
// mutates one field of at a time.
export interface QuizAnswers {
  heldCardIds: string[]; // Q1 ("I don't have any yet" => [])
  annualIncome: IncomeBracket; // Q2
  flightFrequency: FrequencyBucket; // Q3
  hotelFrequency: FrequencyBucket; // Q4
  gymMembership: GymMembershipBucket; // Q5
  foodDeliverySpend: SpendBucket; // Q6
  ecommerceSpend: SpendBucket; // Q7
  grocerySpend: SpendBucket; // Q8
  diningOutSpend: SpendBucket; // Q9
  fuelSpend: SpendBucket; // Q10
  recurringBillsByCard: RecurringBillsAnswer; // Q11
  feeTolerant: boolean; // Q12
  priorityCategories: SpendCategory[]; // Q13, up to 2 ("No strong preference" => [])
}

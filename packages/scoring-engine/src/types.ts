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

// Feature 3 §11: credit score range, self-reported, carried over from
// Feature 2's original design per the Feature 3 PRD.
export type CreditScoreRange = "below-650" | "650-750" | "750-plus" | "unknown";
export type ActiveEmiCount = "0" | "1" | "2" | "3-plus";

// Raw shape of the 13 quiz answers (PRD §8) + Feature 3's 6 financial-
// context fields (Engineering Plan 2B — same object, not a separate
// schema), keyed by question_key — this is what's stored in
// user_profile.answers jsonb and what a profile edit mutates one field of
// at a time.
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

  // Feature 3 §11 — all optional/nullable: a profile created before this
  // feature shipped, or a user who hasn't filled these in, must not break
  // scoreCards or scorePaymentOptions.
  creditScoreRange?: CreditScoreRange | null;
  activeEmiCount?: ActiveEmiCount | null;
  statementDate?: number | null; // day-of-month, 1-31
  paymentDueDate?: number | null; // day-of-month, 1-31
  outstandingBalance?: number | null;
  creditLimit?: number | null;
}

// --- Feature 3 (Goal-Based Purchase Advisor) domain types ---
// Defined here (not in apps/web) since scorePaymentOptions is pure/I/O-free
// like scoreCards, and packages/db/apps/web map their own rows to these
// shapes at the boundary — same worktree-design-note discipline as the
// Card/QuizAnswers split above.
//
// v2 (open-ended web-search redesign): there is no fixed category/channel
// enum anymore — a goal is classified directly into the existing
// SpendCategory taxonomy above (the same one cards.rewardRates already
// uses everywhere else), rather than a bespoke 3-value GoalCategory with a
// lossy mapping onto SpendCategory. One well-defined 8-bucket system, not
// two.

// One discovered listing for a goal search (open web search, not a fixed
// channel) — only a validated, citation-backed result ever reaches
// scorePaymentOptions; unconfirmed/failed candidates are excluded by the
// caller before this function runs.
export interface PurchaseOffer {
  source: string; // human-readable site/seller label, e.g. "Ticketmaster"
  sourceUrl?: string | null;
  price: number; // ₹
  seller?: string | null;
  warrantyMonths?: number | null;
}

// A held card, as scorePaymentOptions needs it — deliberately narrower than
// the full Card type above (no annualFee/milestoneBenefits/eligibility;
// those are Feature 1's card-selection concerns, not relevant once a card
// is already in the user's arsenal and being evaluated for one purchase).
export interface ArsenalCard {
  id: string;
  name: string;
  rewardRates: Record<SpendCategory, number>;
}

// Feature 3 §11's 6 fields, pulled straight off QuizAnswers — a distinct
// type (not just QuizAnswers) so scorePaymentOptions' signature documents
// exactly which fields it actually reads, independent of the other 13+6
// fields on the full profile.
export interface FinancialContext {
  statementDate?: number | null;
  paymentDueDate?: number | null;
  outstandingBalance?: number | null;
  creditLimit?: number | null;
}

export interface PaymentOptionScore {
  source: string;
  sourceUrl: string | null;
  price: number;
  // null = "pay some other way" baseline (no card recommended) — the
  // option that always exists even with an empty arsenal.
  cardId: string | null;
  cardName: string | null;
  // Which of the three payment shapes this option represents — cardId is
  // null for both "no_card" and "bnpl", so this is the explicit discriminant
  // between them (a bnpl option is never confused with the plain no-card
  // baseline downstream).
  paymentMethod: "card" | "no_card" | "bnpl";
  rewardValue: number; // ₹ estimated reward earned on this purchase with this card
  effectiveCost: number; // price - rewardValue, before any utilization penalty
  utilizationWarning: boolean;
  billingCycleNote: string | null;
  // Set only when paymentMethod === "bnpl" — either a real, citation-backed
  // BNPL-provider fact found during discovery, or a generic honest advisory
  // sentence when discovery found nothing specific. Distinct from
  // billingCycleNote, which is card-float-specific.
  bnplNote: string | null;
  // Lower is better — effectiveCost plus a utilization penalty when
  // applicable (see scorePaymentOptions doc comment). This is what options
  // are ranked by, not effectiveCost alone.
  adjustedCost: number;
}
